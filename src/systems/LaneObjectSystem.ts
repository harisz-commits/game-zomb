import { BALANCE } from '../config/BalanceConfig';
import { FONT_FAMILY, WORLD_SCROLL_SPEED } from '../config/GameConfig';
import type { BattleContext } from '../core/BattleContext';
import { GameEvent } from '../core/EventBus';
import { LaneObject, type Lane, type LaneReward } from '../entities/LaneObject';
import { TEX } from '../render/TextureFactory';
import { MAX_WEAPON_LEVEL } from '../data/weaponTiers';
import { clamp, damp, formatCompact, lerp, mixColor } from '../utils/MathUtils';
import { ObjectPool } from '../utils/ObjectPool';
import { audio } from './AudioSystem';

const MAX_LANE_OBJECTS = 26;
const FLASH_DURATION = 0.035;
// Without a cooldown the crate under sustained fire re-arms its flash every
// frame and renders as a solid white block instead of ice.
const FLASH_COOLDOWN = 0.26;
/** Matches the haze the horde fades into, so both lanes recede together. */
const HAZE_TINT = 0xb9cddd;
const HAZE_STEPS = 10;

/**
 * The two things on the bridge that have to be shot open.
 *
 * SUPPLY LANE (left) - a *static* stack of frozen crates. It does not drift:
 * the front crate parks just above the firing line and waits as long as you
 * like. It only advances when you break one, and then the stack slides down
 * and a new crate is queued at the top. Nothing is ever lost by ignoring it -
 * the cost of farming here is simply that nobody is shooting the horde.
 *
 * COMBAT LANE (right) - penalty barriers that ride down with the horde. The
 * number printed on a barrier IS the penalty. Shooting counts it down toward
 * zero, so partial suppression always pays off; whatever is left when it
 * reaches the line is what it costs you in soldiers.
 */
export class LaneObjectSystem {
  private readonly pool: ObjectPool<LaneObject>;
  readonly active: LaneObject[] = [];

  /** Supply crates, front (closest to the army) first. */
  private readonly stack: LaneObject[] = [];

  private nextBarrierAt: number = BALANCE.BARRIER_FIRST_AT;
  private started = false;

  constructor(private readonly ctx: BattleContext) {
    this.pool = new ObjectPool<LaneObject>(
      () => this.createObject(),
      (o) => {
        o.active = false;
        o.sprite.setVisible(false);
        o.label.setVisible(false);
        o.icon.setVisible(false);
      },
      MAX_LANE_OBJECTS,
      10,
    );
  }

  private createObject(): LaneObject {
    const scene = this.ctx.scene;
    const item = new LaneObject();
    item.sprite = scene.add.image(0, 0, TEX.ice).setVisible(false).setDepth(28);
    item.icon = scene.add
      .image(0, 0, TEX.weaponIcon(0))
      .setOrigin(0.5)
      .setVisible(false)
      .setDepth(29);
    item.label = scene.add
      .text(0, 0, '', {
        fontFamily: FONT_FAMILY,
        fontSize: '42px',
        color: '#ffffff',
        fontStyle: 'bold',
        stroke: '#0a0d14',
        strokeThickness: 7,
      })
      .setOrigin(0.5)
      .setVisible(false)
      .setDepth(30);

    this.ctx.worldLayer.add(item.sprite);
    this.ctx.worldLayer.add(item.icon);
    this.ctx.worldLayer.add(item.label);
    return item;
  }

  create(): void {
    this.started = false;
    this.nextBarrierAt = BALANCE.BARRIER_FIRST_AT;
  }

  /* --------------------------------------------------------------- query -- */

  /** The only shootable crate: the one at the front of the stack. */
  get supplyFront(): LaneObject | null {
    return this.stack.length > 0 ? this.stack[0] : null;
  }

  /** The barrier closest to the line. */
  get combatFront(): LaneObject | null {
    let best: LaneObject | null = null;
    for (const item of this.active) {
      if (!item.active || item.lane !== 'COMBAT') continue;
      if (!best || item.y > best.y) best = item;
    }
    return best;
  }

  front(lane: Lane): LaneObject | null {
    return lane === 'SUPPLY' ? this.supplyFront : this.combatFront;
  }

  /* -------------------------------------------------------------- damage -- */

  /** Returns true when the hit finished the object off. */
  applyDamage(item: LaneObject, amount: number): boolean {
    if (!item.active || amount <= 0) return false;

    item.hp -= amount;
    if (item.flashCooldown <= 0) {
      item.flash = FLASH_DURATION;
      item.flashCooldown = FLASH_COOLDOWN;
      item.sprite.setTintFill(0xffffff);
    }

    if (item.hp <= 0) {
      item.hp = 0;
      if (item.kind === 'ICE') {
        this.breakCrate(item);
        return true;
      }
      // A fully suppressed barrier is harmless but stays on the road until it
      // passes the line - it just no longer costs anything.
      return false;
    }
    return false;
  }

  private breakCrate(item: LaneObject): void {
    const x = item.x;
    const y = item.y;

    this.ctx.effects.impact(x, y, 0x9fe3ff, 9);
    this.ctx.effects.explosion(x, y, item.width * 0.5, 0x6fd6ff);
    if (item.reward) this.grantReward(item.reward, x, y, item.width * 0.5);
    audio.play('reinforce', 0.7);

    const index = this.stack.indexOf(item);
    if (index >= 0) this.stack.splice(index, 1);
    this.release(item);
    this.relayoutStack();
  }

  private grantReward(reward: LaneReward, x: number, y: number, item_glow_radius = 90): void {
    const effects = this.ctx.effects;
    switch (reward.type) {
      case 'WEAPON': {
        const weapon = this.ctx.upgrades.upgradeWeapon();
        if (weapon) {
          effects.floatingText(x, y - 30, weapon.name, '#7dff8f', 34);
          this.ctx.effects.explosion(x, y, item_glow_radius, 0x7dff8f);
        } else {
          // Already at the top of the ladder - pay out as raw firepower.
          this.ctx.upgrades.addBonus({ damageMultiplier: 1.15 });
          effects.floatingText(x, y - 30, 'DAMAGE +15%', '#ff8a4c', 30);
        }
        break;
      }
      case 'SOLDIERS': {
        const amount = Math.max(
          1,
          Math.round(reward.amount * this.ctx.upgrades.modifiers.supplyDropMultiplier),
        );
        const added = this.ctx.army.addSoldiers(amount);
        effects.floatingText(x, y - 24, `+${added || amount}`, '#7fd4a2', 34);
        break;
      }
      case 'DAMAGE':
        this.ctx.upgrades.addBonus({ damageMultiplier: 1 + reward.percent / 100 });
        effects.floatingText(x, y - 24, `WEAPON +${reward.percent}%`, '#ff8a4c', 26);
        break;
      case 'FIRE_RATE':
        this.ctx.upgrades.addBonus({ fireRateMultiplier: 1 + reward.percent / 100 });
        effects.floatingText(x, y - 24, `FIRE RATE +${reward.percent}%`, '#ffc65c', 24);
        break;
      case 'DOUBLE_POINTS':
        this.ctx.army.startDoubleReinforcements(reward.seconds);
        effects.floatingText(x, y - 24, '2X POINTS', '#b56cff', 28);
        break;
    }
    this.ctx.events.emit(GameEvent.SUPPLY_DROP_COLLECTED, {
      label: reward.type,
      soldiers: reward.type === 'SOLDIERS' ? reward.amount : 0,
    });
  }

  /* -------------------------------------------------------------- update -- */

  update(dt: number): void {
    if (this.ctx.runtime.over) return;

    if (!this.started && this.ctx.runtime.elapsed >= BALANCE.SUPPLY_FIRST_AT) {
      this.started = true;
      this.relayoutStack();
    }
    if (this.started) this.refillStack();
    this.maybeSpawnBarrier();

    const frontLine = this.ctx.army.frontY;
    const viewport = this.ctx.viewport;
    const drift = WORLD_SCROLL_SPEED * dt;

    for (let i = this.active.length - 1; i >= 0; i--) {
      const item = this.active[i];

      if (item.lane === 'COMBAT') {
        item.y += drift;
      } else {
        // The stack holds position and only eases into a new slot after a
        // crate in front of it was broken.
        item.y = damp(item.y, item.targetY, BALANCE.LANE_STACK_SLIDE, dt);
      }

      if (item.flashCooldown > 0) item.flashCooldown -= dt;
      if (item.flash > 0) {
        item.flash -= dt;
        if (item.flash <= 0) this.applyHaze(item, true);
      } else {
        this.applyHaze(item, false);
      }

      // Both lanes converge on the same vanishing point as the units, so a
      // crate keeps filling its lane no matter how far up the bridge it sits.
      const depth = viewport.depthScale(item.y);
      const px = viewport.projectX(item.x, item.y);
      item.sprite.setPosition(px, item.y).setDisplaySize(item.width * depth, item.height);
      item.icon.setPosition(px, item.y - item.height * 0.26).setScale(item.iconScale * depth);
      item.label.setPosition(px, item.y + item.height * 0.1).setScale(depth);

      // Re-rasterising a Text object is expensive: only write when it changes.
      const shown =
        item.kind === 'ICE' ? Math.max(0, Math.ceil(item.hp)) : this.remainingPenalty(item);
      if (shown !== item.shownHp) {
        item.shownHp = shown;
        // Late-run crates run to five digits; compact form keeps the number
        // inside the crate instead of spilling across both lanes.
        item.label.setText(item.kind === 'ICE' ? formatCompact(shown) : `-${shown}`);
        if (item.kind === 'BARRIER' && shown === 0) {
          item.label.setColor('#7fd4a2');
          item.sprite.setAlpha(0.45);
        }
      }

      if (item.kind === 'ICE' && item.flash <= 0) {
        item.sprite.setAlpha(0.82 + item.hpRatio * 0.18);
      }

      // Only barriers ever reach the line; the stack never does.
      if (item.lane === 'COMBAT' && item.top > frontLine) this.resolveBarrier(item);
    }
  }

  /** Distance haze, matching the horde's (see EnemySystem.applyHaze). */
  private applyHaze(item: LaneObject, force: boolean): void {
    const step = Math.round(this.ctx.viewport.fogAlpha(item.y) * HAZE_STEPS);
    if (!force && step === item.fogStep) return;
    item.fogStep = step;
    item.sprite.setTint(mixColor(0xffffff, HAZE_TINT, (step / HAZE_STEPS) * 0.75));
  }

  /** Soldiers this barrier still costs. Counts down as you shoot it. */
  private remainingPenalty(item: LaneObject): number {
    return Math.max(0, Math.ceil(item.penalty * item.hpRatio));
  }

  private resolveBarrier(item: LaneObject): void {
    const lost = this.remainingPenalty(item);
    const frontY = this.ctx.army.frontY;

    if (lost > 0) {
      for (let i = 0; i < lost; i++) {
        this.ctx.army.damageAt(item.x, Number.POSITIVE_INFINITY);
      }
      this.ctx.effects.explosion(item.x, frontY, 150, 0xff5a5a);
      this.ctx.effects.floatingText(item.x, frontY - 50, `-${lost}`, '#ff5a5a', 40);
      this.ctx.effects.shake(0.014, 0.35);
      audio.play('gameover', 0.5);
    } else {
      this.ctx.effects.floatingText(item.x, frontY - 40, 'BLOCKED', '#7fd4a2', 28);
      audio.play('ui', 0.6);
    }
    this.release(item);
  }

  private release(item: LaneObject): void {
    const index = this.active.indexOf(item);
    if (index >= 0) this.active.splice(index, 1);
    const stackIndex = this.stack.indexOf(item);
    if (stackIndex >= 0) this.stack.splice(stackIndex, 1);
    this.pool.release(item);
  }

  /* --------------------------------------------------------------- stack -- */

  /** Recomputes every crate's slot; front crate parks above the firing line. */
  private relayoutStack(): void {
    let y = this.ctx.army.frontY - BALANCE.LANE_STACK_FRONT_OFFSET;
    for (const item of this.stack) {
      item.targetY = y - item.height / 2;
      y -= item.height + BALANCE.LANE_BLOCK_GAP;
    }
  }

  /** Queues new crates at the back until the stack is deep enough. */
  private refillStack(): void {
    let guard = 0;
    while (this.stack.length < BALANCE.LANE_STACK_MIN && guard++ < 4) {
      const before = this.stack.length;
      this.appendTrain();
      if (this.stack.length === before) break; // pool exhausted
    }
  }

  /** One weapon crate followed by a run of "+1" fillers. */
  private appendTrain(): void {
    const weapon = this.spawnCrate(
      this.weaponCrateHp(),
      BALANCE.LANE_BIG_BLOCK_HEIGHT,
      this.rollReward(),
    );
    if (!weapon) return;

    const fillers = this.ctx.rng.int(BALANCE.LANE_FILLER_COUNT[0], BALANCE.LANE_FILLER_COUNT[1]);
    for (let i = 0; i < fillers; i++) {
      this.spawnCrate(BALANCE.LANE_FILLER_HP, BALANCE.LANE_FILLER_BLOCK_HEIGHT, {
        type: 'SOLDIERS',
        amount: BALANCE.LANE_FILLER_SOLDIERS,
      });
    }
    this.relayoutStack();
  }

  /**
   * A weapon crate should cost roughly a second of the army's undivided
   * attention. Priced in DPS rather than as a flat number, it stays a real
   * decision at every army size instead of melting instantly late on.
   */
  private weaponCrateHp(): number {
    const dpsCost = this.ctx.combat.estimatedDps * BALANCE.LANE_BLOCK_DPS_SECONDS;
    const timeFloor =
      BALANCE.LANE_BLOCK_BASE_HP *
      (1 + this.ctx.runtime.elapsed * BALANCE.LANE_BLOCK_TIME_SCALING);
    return Math.max(BALANCE.LANE_BLOCK_BASE_HP, Math.round(Math.max(timeFloor, dpsCost)));
  }

  private rollReward(): LaneReward {
    // While there is still a better gun to find, most weapon crates hand one
    // out - the visible ladder is the reason to leave the horde alone at all.
    if (!this.ctx.upgrades.weaponMaxed && this.ctx.rng.next() < BALANCE.LANE_WEAPON_CHANCE) {
      return { type: 'WEAPON' };
    }
    const row = this.ctx.rng.weighted(BALANCE.LANE_REWARDS, (r) => r.weight);
    const pick = row ?? BALANCE.LANE_REWARDS[0];
    switch (pick.kind) {
      case 'DAMAGE':
        return { type: 'DAMAGE', percent: pick.percent ?? 10 };
      case 'FIRE_RATE':
        return { type: 'FIRE_RATE', percent: pick.percent ?? 8 };
      case 'DOUBLE_POINTS':
        return { type: 'DOUBLE_POINTS', seconds: pick.seconds ?? 10 };
      default:
        return { type: 'SOLDIERS', amount: pick.amount ?? 10 };
    }
  }

  private spawnCrate(hp: number, height: number, reward: LaneReward): LaneObject | null {
    const item = this.pool.obtain();
    if (!item) return null;

    const viewport = this.ctx.viewport;
    const width = viewport.supplyLaneWidth * BALANCE.LANE_BLOCK_WIDTH_RATIO;

    item.kind = 'ICE';
    item.lane = 'SUPPLY';
    item.active = true;
    item.width = width;
    item.height = height;
    item.x = viewport.supplyLaneCenterX;
    item.hp = hp;
    item.maxHp = hp;
    item.reward = reward;
    item.penalty = 0;
    item.flash = 0;
    item.flashCooldown = 0;
    item.shownHp = -1;
    item.fogStep = -1;

    // Enter from above the last crate so it slides in rather than popping.
    const last = this.stack[this.stack.length - 1];
    item.y = last ? last.targetY - last.height : viewport.visibleTop - 120;
    item.targetY = item.y;

    item.sprite
      .setTexture(TEX.ice)
      .setVisible(true)
      .setDisplaySize(width, height)
      .setPosition(item.x, item.y)
      .setAlpha(1)
      .clearTint();
    const bigCrate = height > 100;
    item.icon
      .setVisible(bigCrate)
      .setTexture(TEX.weaponIcon(iconWeaponLevel(reward, this.ctx.upgrades.weaponIndex)));
    item.iconScale = (width * 0.62) / 84;
    item.label
      .setVisible(true)
      .setFontSize(height > 100 ? 46 : 26)
      .setColor('#ffffff');

    this.active.push(item);
    this.stack.push(item);
    return item;
  }

  /* ------------------------------------------------------------ barriers -- */

  private maybeSpawnBarrier(): void {
    const runtime = this.ctx.runtime;
    if (runtime.elapsed < this.nextBarrierAt) return;

    this.nextBarrierAt =
      runtime.elapsed +
      this.ctx.rng.range(BALANCE.BARRIER_INTERVAL[0], BALANCE.BARRIER_INTERVAL[1]);

    const item = this.pool.obtain();
    if (!item) return;

    const viewport = this.ctx.viewport;
    const width = viewport.combatLaneWidth * BALANCE.BARRIER_WIDTH_RATIO;
    const hp = Math.max(
      BALANCE.BARRIER_MIN_HP,
      Math.round(this.ctx.combat.estimatedDps * BALANCE.BARRIER_DPS_SECONDS),
    );

    item.kind = 'BARRIER';
    item.lane = 'COMBAT';
    item.active = true;
    item.width = width;
    item.height = BALANCE.BARRIER_HEIGHT;
    item.x = viewport.combatLaneCenterX;
    item.y = viewport.visibleTop - 90;
    item.targetY = item.y;
    item.hp = hp;
    item.maxHp = hp;
    item.reward = null;
    const ramp = clamp(runtime.elapsed / BALANCE.BARRIER_PENALTY_RAMP, 0, 1);
    const low = lerp(BALANCE.BARRIER_PENALTY[0], BALANCE.BARRIER_PENALTY_LATE[0], ramp);
    const high = lerp(BALANCE.BARRIER_PENALTY[1], BALANCE.BARRIER_PENALTY_LATE[1], ramp);
    item.penalty = clamp(Math.round(this.ctx.rng.range(low, high)), 1, 99);
    item.flash = 0;
    item.flashCooldown = 0;
    item.shownHp = -1;
    item.fogStep = -1;

    item.sprite
      .setTexture(TEX.barrier)
      .setVisible(true)
      .setDisplaySize(width, item.height)
      .setPosition(item.x, item.y)
      .setAlpha(1)
      .clearTint();
    item.icon.setVisible(false);
    item.label.setVisible(true).setFontSize(42).setColor('#ffe4e4');

    this.active.push(item);
  }

  /**
   * Re-fits everything on the bridge to the new lane geometry.
   *
   * Width and lane centre are captured when an object spawns, so without this
   * a crate spawned in portrait keeps its portrait width after the player
   * turns the phone and overhangs the divider.
   */
  resize(): void {
    const viewport = this.ctx.viewport;
    for (const item of this.active) {
      if (item.lane === 'SUPPLY') {
        item.x = viewport.supplyLaneCenterX;
        item.width = viewport.supplyLaneWidth * BALANCE.LANE_BLOCK_WIDTH_RATIO;
      } else {
        item.x = viewport.combatLaneCenterX;
        item.width = viewport.combatLaneWidth * BALANCE.BARRIER_WIDTH_RATIO;
      }
      item.sprite.setDisplaySize(item.width * viewport.depthScale(item.y), item.height);
    }
    this.relayoutStack();
  }

  reset(): void {
    for (let i = this.active.length - 1; i >= 0; i--) this.release(this.active[i]);
    this.stack.length = 0;
    this.nextBarrierAt = BALANCE.BARRIER_FIRST_AT;
    this.started = false;
  }
}

/**
 * Which gun to draw on a crate.
 *
 * A weapon crate shows the gun you are about to get, so the choice to break it
 * is made on what you can see, not on a guess. Everything else borrows the
 * current weapon's glyph as a generic "firepower" mark.
 */
function iconWeaponLevel(reward: LaneReward, current: number): number {
  if (reward.type === 'WEAPON') return Math.min(current + 1, MAX_WEAPON_LEVEL);
  return current;
}

export type { Lane };
