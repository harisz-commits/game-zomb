import Phaser from 'phaser';
import { BALANCE } from '../config/BalanceConfig';
import { ARMY_BASE_Y, COLORS, ENTITY_LIMITS, FIELD_PADDING_X } from '../config/GameConfig';
import type { BattleContext } from '../core/BattleContext';
import { GameEvent } from '../core/EventBus';
import { Soldier } from '../entities/Soldier';
import { TEX, ensureSoldierTexture } from '../render/TextureFactory';
import type { SoldierTier } from '../types/game';
import { clamp, damp, distributeRows } from '../utils/MathUtils';

/** Sprite headroom above the promotion threshold (supply drops can overshoot). */
const SPRITE_CAPACITY = ENTITY_LIMITS.maxVisibleSoldiers + 30;
const SPAWN_DURATION = 0.32;

/**
 * Owns the army: formation layout, movement, HP, deaths and reinforcements.
 *
 * Soldier positions are pure math (formation slot -> eased position). There is
 * no physics body anywhere in here, which is what allows 140 units at 60 fps.
 */
export class ArmySystem {
  readonly soldiers: Soldier[] = [];

  private readonly spritePool: Phaser.GameObjects.Image[] = [];
  private shieldSprite!: Phaser.GameObjects.Image;
  /** Ground shadow + muzzle light under the block. */
  private groundShadow!: Phaser.GameObjects.Image;
  private muzzleLight!: Phaser.GameObjects.Image;

  private centerX = 0;
  private targetX = 0;
  private formationHalfWidth = 60;
  private frontRowY = ARMY_BASE_Y;

  private reinforcementPoints = 0;
  private doubleReinforcementTimer = 0;

  private shieldTimer = 0;
  private guardianTimer = 0;
  private guardianReady = false;

  private tier!: SoldierTier;
  private tierTexture = TEX.soldier(0, 0);
  /** Weapon level the sprites are currently drawn with. */
  private shownWeapon = -1;

  /** Cached layout so we only rebuild slots when the count/width changes. */
  private layoutCount = -1;
  private layoutWidth = -1;

  constructor(private readonly ctx: BattleContext) {}

  /* ----------------------------------------------------------- lifecycle -- */

  create(): void {
    this.tier = this.ctx.promotion.currentTier;
    this.refreshTexture();

    this.centerX = this.ctx.viewport.centerX;
    this.targetX = this.centerX;

    this.shieldSprite = this.ctx.scene.add
      .image(this.centerX, ARMY_BASE_Y, TEX.shield)
      .setVisible(false)
      .setDepth(55)
      .setTint(0x9aa7ff);
    this.ctx.worldLayer.add(this.shieldSprite);

    // One shadow and one light for the whole block rather than 140 of each:
    // the formation is packed tight enough that per-unit shadows would merge
    // into the same blob anyway, at 140x the draw cost.
    this.groundShadow = this.ctx.scene.add
      .image(this.centerX, ARMY_BASE_Y, TEX.glow)
      .setDepth(22)
      .setTint(0x000000)
      .setAlpha(0.5);
    this.muzzleLight = this.ctx.scene.add
      .image(this.centerX, ARMY_BASE_Y, TEX.glow)
      .setDepth(23)
      .setTint(0xffb45c)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setAlpha(0);
    this.ctx.worldLayer.add(this.groundShadow);
    this.ctx.worldLayer.add(this.muzzleLight);

    this.addSoldiers(BALANCE.STARTING_SOLDIERS, true);
    this.layout(true);
  }

  /* -------------------------------------------------------------- getters -- */

  get count(): number {
    return this.soldiers.length;
  }

  get formationX(): number {
    return this.centerX;
  }

  get frontY(): number {
    return this.frontRowY;
  }

  /** Half the formation width - the catch radius for supply drops. */
  get halfWidth(): number {
    return this.formationHalfWidth;
  }

  get currentTier(): SoldierTier {
    return this.tier;
  }

  get tierPower(): number {
    return this.tier.power;
  }

  /** Total army power - drives the director's (gentle) power scaling. */
  get armyPower(): number {
    return this.count * this.tier.power;
  }

  get shielded(): boolean {
    return this.shieldTimer > 0;
  }

  get reinforcementProgress(): number {
    return this.reinforcementPoints;
  }

  get reinforcementThreshold(): number {
    return (
      BALANCE.REINFORCEMENT_THRESHOLD_BASE *
      Math.pow(this.tier.power, BALANCE.REINFORCEMENT_TIER_EXPONENT)
    );
  }

  get doubleReinforcementsActive(): boolean {
    return this.doubleReinforcementTimer > 0;
  }

  /** Per-soldier damage, including tier power and all run modifiers. */
  get soldierDamage(): number {
    const mods = this.ctx.upgrades.modifiers;
    let damage = BALANCE.BASE_DAMAGE * this.tier.power * mods.damageMultiplier;
    if (mods.specials.has('LAST_STAND') && this.count < BALANCE.LAST_STAND_THRESHOLD) {
      damage *= 1 + BALANCE.LAST_STAND_DAMAGE;
    }
    return damage;
  }

  get soldierMaxHp(): number {
    return BALANCE.BASE_HP * this.tier.power * this.ctx.upgrades.modifiers.hpMultiplier;
  }

  get range(): number {
    return BALANCE.BASE_RANGE * this.ctx.upgrades.modifiers.rangeMultiplier;
  }

  /* ------------------------------------------------------------ movement -- */

  setTargetX(worldX: number): void {
    this.targetX = worldX;
  }

  nudge(direction: number, dt: number): void {
    this.targetX += direction * BALANCE.KEYBOARD_SPEED * dt;
  }

  /* ------------------------------------------------------------- roster --- */

  /**
   * Adds soldiers. Returns how many were actually added (sprite cap aware).
   * `silent` skips the event/audio burst used for the initial squad.
   */
  addSoldiers(amount: number, silent = false): number {
    let added = 0;
    for (let i = 0; i < amount; i++) {
      if (this.soldiers.length >= SPRITE_CAPACITY) break;
      const soldier = this.createSoldier();
      this.soldiers.push(soldier);
      added++;
    }
    if (added > 0) {
      this.layoutCount = -1;
      if (!silent) {
        this.ctx.events.emit(GameEvent.SOLDIER_ADDED, { count: added, total: this.count });
      }
      this.ctx.events.emit(GameEvent.ARMY_CHANGED, {
        count: this.count,
        tierIndex: this.ctx.promotion.currentTierIndex,
      });
      this.ctx.score.trackArmySize(this.count);
    }
    return added;
  }

  private createSoldier(): Soldier {
    const soldier = new Soldier();
    const sprite = this.obtainSprite();
    soldier.sprite = sprite;
    soldier.phase = Math.random() * Math.PI * 2;
    // Spawn from behind the formation so reinforcements "march in".
    soldier.reset(this.centerX + (Math.random() - 0.5) * 40, ARMY_BASE_Y + 190, this.soldierMaxHp);
    sprite.setTexture(this.tierTexture).setVisible(true).setAlpha(0).setScale(0.4);
    return soldier;
  }

  /**
   * How large a single soldier is drawn.
   *
   * A three-man squad should fill the lane the way it does in a real firefight;
   * a 140-strong block cannot, or it would be a solid wall of pixels. So the
   * sprite scale slides from big to compact as the army grows - the *block*
   * keeps roughly the same visual weight either way.
   */
  private get unitScale(): number {
    // Square-root falloff: the block's total footprint grows with the roster
    // instead of exploding with it. The cap is set so a starting squad matches
    // the reference's character size at the firing line; the floor keeps a
    // full 140 readable.
    return clamp(4.6 / Math.sqrt(Math.max(1, this.soldiers.length)), 0.55, 1.55);
  }

  /** Re-points the sprites at the current tier + weapon combination. */
  private refreshTexture(): void {
    const weapon = this.ctx.upgrades.weaponIndex;
    this.tierTexture = ensureSoldierTexture(this.ctx.scene, this.tier.visual, weapon);
    this.shownWeapon = weapon;
    for (const soldier of this.soldiers) {
      soldier.sprite.setTexture(this.tierTexture);
      if (this.tier.prestige > 0) soldier.sprite.setTint(this.tier.accentColor);
      else soldier.sprite.clearTint();
    }
  }

  private obtainSprite(): Phaser.GameObjects.Image {
    const recycled = this.spritePool.pop();
    if (recycled) return recycled;
    const sprite = this.ctx.scene.add.image(0, 0, this.tierTexture).setDepth(30);
    this.ctx.worldLayer.add(sprite);
    return sprite;
  }

  private releaseSoldier(index: number): void {
    const soldier = this.soldiers[index];
    soldier.sprite.setVisible(false).clearTint();
    this.spritePool.push(soldier.sprite);
    this.soldiers.splice(index, 1);
    this.layoutCount = -1;
  }

  /* ------------------------------------------------------ reinforcements -- */

  addReinforcementPoints(points: number): void {
    const mods = this.ctx.upgrades.modifiers;
    let gain = points * mods.reinforcementMultiplier;
    if (this.doubleReinforcementTimer > 0) gain *= 2;
    this.reinforcementPoints += gain;

    const threshold = this.reinforcementThreshold;
    let spawned = 0;
    while (
      this.reinforcementPoints >= threshold &&
      spawned < BALANCE.MAX_REINFORCEMENTS_PER_TICK
    ) {
      this.reinforcementPoints -= threshold;
      if (this.addSoldiers(1) === 0) {
        this.reinforcementPoints = threshold; // roster full - hold the meter
        break;
      }
      spawned++;
    }

    this.ctx.events.emit(GameEvent.REINFORCEMENT_GAINED, {
      progress: this.reinforcementPoints,
      threshold,
    });
  }

  startDoubleReinforcements(seconds: number): void {
    this.doubleReinforcementTimer = Math.max(this.doubleReinforcementTimer, seconds);
  }

  /* -------------------------------------------------------------- damage -- */

  /**
   * Applies incoming damage to the soldier best matching `x`, preferring the
   * front rows. Returns true when a soldier died.
   */
  damageAt(x: number, amount: number): boolean {
    if (this.soldiers.length === 0) return false;
    if (this.shieldTimer > 0) return false;

    let bestIndex = -1;
    let bestScore = Infinity;
    for (let i = 0; i < this.soldiers.length; i++) {
      const soldier = this.soldiers[i];
      const score = Math.abs(soldier.x - x) + soldier.row * 26;
      if (score < bestScore) {
        bestScore = score;
        bestIndex = i;
      }
    }
    if (bestIndex < 0) return false;

    const soldier = this.soldiers[bestIndex];
    const lethal = soldier.hp - amount <= 0;

    if (lethal && this.guardianReady) {
      // Guardian Protocol: negate one lethal hit, then go on cooldown.
      this.guardianReady = false;
      this.guardianTimer = BALANCE.GUARDIAN_PROTOCOL_INTERVAL;
      soldier.hp = Math.max(1, soldier.maxHp * 0.35);
      soldier.flash = 0.2;
      this.ctx.effects.floatingText(soldier.x, soldier.y - 26, 'SAVED', '#9aa7ff', 18);
      return false;
    }

    soldier.hp -= amount;
    soldier.flash = 0.12;

    if (soldier.hp <= 0) {
      this.ctx.effects.impact(soldier.x, soldier.y, COLORS.soldierBlue, 4);
      this.releaseSoldier(bestIndex);
      this.ctx.events.emit(GameEvent.SOLDIER_DIED, {
        x: soldier.x,
        y: soldier.y,
        remaining: this.count,
      });
      this.ctx.events.emit(GameEvent.ARMY_CHANGED, {
        count: this.count,
        tierIndex: this.ctx.promotion.currentTierIndex,
      });
      return true;
    }
    return false;
  }

  /** QA helper (debug builds only): wipes the roster to exercise game over. */
  wipe(): void {
    while (this.soldiers.length > 0) {
      const last = this.soldiers[this.soldiers.length - 1];
      const x = last.x;
      const y = last.y;
      this.releaseSoldier(this.soldiers.length - 1);
      this.ctx.events.emit(GameEvent.SOLDIER_DIED, { x, y, remaining: this.count });
    }
    this.ctx.events.emit(GameEvent.ARMY_CHANGED, {
      count: 0,
      tierIndex: this.ctx.promotion.currentTierIndex,
    });
  }

  activateShield(duration: number): void {
    this.shieldTimer = Math.max(this.shieldTimer, duration);
  }

  /* ----------------------------------------------------------- promotion -- */

  /** Rebuilds the army at a new tier with the converted count. */
  applyPromotion(tier: SoldierTier, newCount: number): void {
    this.tier = tier;
    this.tierTexture = ensureSoldierTexture(
      this.ctx.scene,
      tier.visual,
      this.ctx.upgrades.weaponIndex,
    );
    this.shownWeapon = this.ctx.upgrades.weaponIndex;

    const target = clamp(newCount, 1, SPRITE_CAPACITY);
    while (this.soldiers.length > target) this.releaseSoldier(this.soldiers.length - 1);
    while (this.soldiers.length < target) this.soldiers.push(this.createSoldier());

    const maxHp = this.soldierMaxHp;
    for (const soldier of this.soldiers) {
      soldier.sprite.setTexture(this.tierTexture);
      // Prestige tiers reuse the Black Ops silhouette, tinted by accent colour.
      if (tier.prestige > 0) soldier.sprite.setTint(tier.accentColor);
      else soldier.sprite.clearTint();
      soldier.maxHp = maxHp;
      soldier.hp = maxHp; // a promotion fully restores the line
      soldier.spawnT = 0.35;
    }

    this.layoutCount = -1;
    this.layout(true);
    this.ctx.events.emit(GameEvent.ARMY_CHANGED, {
      count: this.count,
      tierIndex: this.ctx.promotion.currentTierIndex,
    });
    this.ctx.score.trackArmySize(this.count);
  }

  /** Re-applies HP modifiers after a new upgrade card (keeps the HP ratio). */
  refreshStats(): void {
    const maxHp = this.soldierMaxHp;
    for (const soldier of this.soldiers) {
      const ratio = soldier.maxHp > 0 ? soldier.hp / soldier.maxHp : 1;
      soldier.maxHp = maxHp;
      soldier.hp = Math.min(maxHp, maxHp * ratio);
    }
  }

  /* -------------------------------------------------------------- update -- */

  update(dt: number): void {
    const viewport = this.ctx.viewport;

    // Formation follows the pointer with heavy smoothing: the crowd should
    // feel like mass, never teleport.
    const minX = viewport.fieldLeft + this.formationHalfWidth + FIELD_PADDING_X;
    const maxX = viewport.fieldRight - this.formationHalfWidth - FIELD_PADDING_X;
    this.targetX = clamp(this.targetX, Math.min(minX, maxX), Math.max(minX, maxX));
    this.centerX = damp(this.centerX, this.targetX, BALANCE.FORMATION_LERP, dt);

    this.layout(false);

    // A weapon crate changes the gun in every soldier's hands - that is the
    // whole point of the weapon ladder, so it must land on the same frame.
    if (this.ctx.upgrades.weaponIndex !== this.shownWeapon) this.refreshTexture();

    const mods = this.ctx.upgrades.modifiers;
    const regen = mods.regenPerSecond;
    const maxHp = this.soldierMaxHp;
    const unitScale = this.unitScale;

    for (const soldier of this.soldiers) {
      if (soldier.spawnT < 1) {
        soldier.spawnT = Math.min(1, soldier.spawnT + dt / SPAWN_DURATION);
      }
      if (regen > 0 && soldier.hp < maxHp) {
        soldier.hp = Math.min(maxHp, soldier.hp + regen * dt);
      }

      soldier.x = damp(soldier.x, soldier.slotX, BALANCE.SOLDIER_LERP, dt);
      soldier.y = damp(soldier.y, soldier.slotY, BALANCE.SOLDIER_LERP, dt);

      const sprite = soldier.sprite;
      const eased = soldier.spawnT * soldier.spawnT * (3 - 2 * soldier.spawnT);
      // Rows further from the camera sit closer to the vanishing point and are
      // drawn smaller - the back of a 140-strong block visibly recedes.
      const depth = viewport.depthScale(soldier.y);
      sprite.x = viewport.projectX(soldier.x, soldier.y);
      // Subtle idle bob keeps the formation alive without extra objects.
      sprite.y = soldier.y + Math.sin(soldier.phase + this.ctx.runtime.elapsed * 4) * 0.8;
      sprite.setAlpha(eased);
      sprite.setScale((0.55 + eased * 0.45) * depth * unitScale);

      if (soldier.flash > 0) {
        soldier.flash -= dt;
        sprite.setTintFill(0xffffff);
        if (soldier.flash <= 0) {
          if (this.tier.prestige > 0) sprite.setTint(this.tier.accentColor);
          else sprite.clearTint();
        }
      }
    }

    if (this.doubleReinforcementTimer > 0) this.doubleReinforcementTimer -= dt;

    this.updateGroundLight();
    this.updateShield(dt);
    this.updateGuardian(dt);
  }

  /**
   * Grounds the block: a soft shadow on the deck, plus a warm light that
   * swells with the volume of fire. Sold entirely by two stretched sprites.
   */
  private updateGroundLight(): void {
    const viewport = this.ctx.viewport;
    const y = this.frontRowY + 70;
    const depth = viewport.depthScale(y);
    const width = Math.max(120, this.formationHalfWidth * 2.5) * depth;
    const x = viewport.projectX(this.centerX, y);

    if (!this.ctx.quality.settings.groundLight) {
      this.groundShadow.setAlpha(0);
      this.muzzleLight.setAlpha(0);
      return;
    }

    this.groundShadow
      .setPosition(x, y)
      .setDisplaySize(width, width * 0.62)
      .setAlpha(this.count > 0 ? 0.5 : 0);

    // gunfireRate is shots/second across the whole army.
    const intensity = clamp(this.ctx.runtime.gunfireRate / 90, 0, 1);
    this.muzzleLight
      .setPosition(x, this.frontRowY - 6)
      .setDisplaySize(width * 1.15, width * 0.7)
      .setAlpha(intensity * 0.42);
  }

  private updateShield(dt: number): void {
    if (this.shieldTimer > 0) {
      this.shieldTimer -= dt;
      const size = Math.max(140, this.formationHalfWidth * 2.6);
      this.shieldSprite
        .setVisible(true)
        .setPosition(
          this.ctx.viewport.projectX(this.centerX, this.frontRowY + 60),
          this.frontRowY + 60,
        )
        .setDisplaySize(size, size * 0.8)
        .setAlpha(0.25 + Math.sin(this.ctx.runtime.elapsed * 12) * 0.08);
    } else if (this.shieldSprite.visible) {
      this.shieldSprite.setVisible(false);
    }
  }

  private updateGuardian(dt: number): void {
    if (!this.ctx.upgrades.modifiers.specials.has('GUARDIAN_PROTOCOL')) {
      this.guardianReady = false;
      return;
    }
    if (this.guardianReady) return;
    this.guardianTimer -= dt;
    if (this.guardianTimer <= 0) {
      this.guardianReady = true;
      this.guardianTimer = 0;
    }
  }

  /* -------------------------------------------------------------- layout -- */

  /**
   * Recomputes formation slots.
   *
   * Rows are distributed so small squads form the classic 3/4/3 wedge and
   * large armies form a wide, compact block:
   *   10 soldiers -> 3 / 4 / 3
   *   140         -> 15 columns x 10 rows
   */
  private layout(force: boolean): void {
    const count = this.soldiers.length;
    const availableWidth = this.ctx.viewport.fieldWidth * BALANCE.FORMATION_MAX_WIDTH_RATIO;

    if (force || count !== this.layoutCount || availableWidth !== this.layoutWidth) {
      this.rebuildSlots(count, availableWidth);
      this.layoutCount = count;
      this.layoutWidth = availableWidth;
    }

    // Slot offsets are cached; only the centre moves every frame.
    for (const soldier of this.soldiers) {
      soldier.slotX = this.centerX + soldier.slotOffsetX;
    }
  }

  private rebuildSlots(count: number, availableWidth: number): void {
    if (count === 0) {
      this.formationHalfWidth = 40;
      return;
    }

    const columns = clamp(Math.round(Math.sqrt(count * 1.7)), 3, 22);
    const rows = Math.max(1, Math.ceil(count / columns));
    const rowCounts = distributeRows(count, rows);
    // Spacing tracks the sprite scale: a small squad is drawn big, and without
    // this its soldiers would pile into one unreadable blob.
    const scale = this.unitScale;
    const spacing = Math.min(
      BALANCE.FORMATION_COL_SPACING * scale,
      availableWidth / columns,
    );
    const rowSpacing = BALANCE.FORMATION_ROW_SPACING * scale;

    let index = 0;
    let widest = 0;
    for (let row = 0; row < rows; row++) {
      const inRow = rowCounts[row];
      if (inRow <= 0) continue;
      const rowWidth = (inRow - 1) * spacing;
      widest = Math.max(widest, rowWidth);
      const startOffset = -rowWidth / 2;
      const rowY = ARMY_BASE_Y + row * rowSpacing;
      // Stagger every other row by half a step for an organic block.
      const stagger = row % 2 === 1 ? spacing * 0.25 : 0;

      for (let col = 0; col < inRow; col++) {
        const soldier = this.soldiers[index++];
        if (!soldier) break;
        soldier.row = row;
        // Rows nearer the camera paint over the ones behind them. Set here
        // rather than per frame: re-sorting the display list every frame for
        // a formation that only changes on a roster change is wasted work.
        soldier.sprite.setDepth(30 + row * 0.01);
        soldier.slotOffsetX = startOffset + col * spacing + stagger;
        soldier.slotX = this.centerX + soldier.slotOffsetX;
        soldier.slotY = rowY;
      }
    }

    this.formationHalfWidth = widest / 2 + 16;
    this.frontRowY = ARMY_BASE_Y;
  }

  reset(): void {
    while (this.soldiers.length > 0) this.releaseSoldier(this.soldiers.length - 1);
    this.reinforcementPoints = 0;
    this.doubleReinforcementTimer = 0;
    this.shieldTimer = 0;
    this.guardianTimer = 0;
    this.guardianReady = false;
  }
}
