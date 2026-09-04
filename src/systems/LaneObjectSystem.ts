import { BALANCE } from '../config/BalanceConfig';
import { FONT_FAMILY, WORLD_SCROLL_SPEED } from '../config/GameConfig';
import type { BattleContext } from '../core/BattleContext';
import { GameEvent } from '../core/EventBus';
import { LaneObject, type Lane, type LaneReward } from '../entities/LaneObject';
import { TEX } from '../render/TextureFactory';
import { clamp } from '../utils/MathUtils';
import { ObjectPool } from '../utils/ObjectPool';
import { audio } from './AudioSystem';

const MAX_LANE_OBJECTS = 26;
const FLASH_DURATION = 0.06;

/**
 * Everything that travels down a lane and has to be shot.
 *
 * This is the system that creates the game's central decision. Soldiers fire
 * straight ahead, so the formation can only be pointed at one lane at a time:
 *
 *   - stand left  -> break the frozen supply block and take the reward, while
 *                    the horde advances unopposed;
 *   - stand right -> hold the horde, and watch the supply block drift past.
 *
 * Supply blocks arrive as a train: one tough reward block followed by a run of
 * 1 HP fillers that pop in a satisfying burst once the big one goes.
 */
export class LaneObjectSystem {
  private readonly pool: ObjectPool<LaneObject>;
  readonly active: LaneObject[] = [];

  private nextSequence = 0;
  private supplyTail = 0;
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
      8,
    );
  }

  private createObject(): LaneObject {
    const scene = this.ctx.scene;
    const item = new LaneObject();
    item.sprite = scene.add.image(0, 0, TEX.ice).setVisible(false).setDepth(28);
    item.icon = scene.add
      .text(0, 0, '', { fontFamily: FONT_FAMILY, fontSize: '26px', color: '#eaf6ff' })
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
        strokeThickness: 6,
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
    // Start the conveyor just above the firing line so the very first block is
    // immediately a real decision, not something the player waits ten seconds
    // for.
    this.supplyTail = this.ctx.army.frontY - 220;
    this.started = false;
  }

  /* --------------------------------------------------------------- query -- */

  /** The closest (lowest) live object in a lane - the only shootable one. */
  front(lane: Lane): LaneObject | null {
    let best: LaneObject | null = null;
    for (const item of this.active) {
      if (!item.active || item.lane !== lane) continue;
      if (!best || item.y > best.y) best = item;
    }
    return best;
  }

  get supplyFront(): LaneObject | null {
    return this.front('SUPPLY');
  }

  get combatFront(): LaneObject | null {
    return this.front('COMBAT');
  }

  /* -------------------------------------------------------------- damage -- */

  /** Returns true when the hit destroyed the object. */
  applyDamage(item: LaneObject, amount: number): boolean {
    if (!item.active || amount <= 0) return false;

    item.hp -= amount;
    if (item.flash <= 0) {
      item.flash = FLASH_DURATION;
      item.sprite.setTintFill(0xffffff);
    }

    if (item.hp <= 0) {
      this.destroy(item);
      return true;
    }
    return false;
  }

  private destroy(item: LaneObject): void {
    const x = item.x;
    const y = item.y;

    if (item.kind === 'ICE') {
      this.ctx.effects.impact(x, y, 0x9fe3ff, 8);
      this.ctx.effects.explosion(x, y, item.width * 0.5, 0x6fd6ff);
      if (item.reward) this.grantReward(item.reward, x, y);
      audio.play('reinforce', 0.7);
    } else {
      this.ctx.effects.explosion(x, y, item.width * 0.45, 0xff6b6b);
      this.ctx.effects.floatingText(x, y - 30, 'CLEARED', '#7fd4a2', 24);
      audio.play('explosion', 0.6);
    }

    this.release(item);
  }

  private grantReward(reward: LaneReward, x: number, y: number): void {
    const effects = this.ctx.effects;
    switch (reward.type) {
      case 'SOLDIERS': {
        // COMMAND cards ("Supply Lines", "Rapid Mobilization") scale this.
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
        effects.floatingText(x, y - 24, `+${reward.percent}% DMG`, '#ff8a4c', 28);
        break;
      case 'FIRE_RATE':
        this.ctx.upgrades.addBonus({ fireRateMultiplier: 1 + reward.percent / 100 });
        effects.floatingText(x, y - 24, `+${reward.percent}% ROF`, '#ffc65c', 28);
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
    }
    this.maybeSpawnBarrier();

    const frontLine = this.ctx.army.frontY;
    const drift = WORLD_SCROLL_SPEED * dt;

    // The tail marks the top of the spawned train, so it has to travel with
    // the train. Leaving it fixed made it fall permanently below the refill
    // ceiling after the first fill, and the lane silently ran dry.
    this.supplyTail += drift;

    for (let i = this.active.length - 1; i >= 0; i--) {
      const item = this.active[i];
      item.y += drift;

      if (item.flash > 0) {
        item.flash -= dt;
        if (item.flash <= 0) item.sprite.clearTint();
      }

      item.sprite.setPosition(item.x, item.y);
      item.icon.setPosition(item.x, item.y - item.height * 0.26);
      item.label.setPosition(item.x, item.y + item.height * 0.1);

      // Re-rasterising a Text object is expensive; only do it when the
      // displayed number actually changes.
      const shown = Math.max(0, Math.ceil(item.hp));
      if (shown !== item.shownHp) {
        item.shownHp = shown;
        item.label.setText(String(shown));
      }

      // Ice frosts over as it takes damage, so progress reads at a glance.
      if (item.kind === 'ICE' && item.flash <= 0) {
        item.sprite.setAlpha(0.82 + item.hpRatio * 0.18);
      }

      if (item.top > frontLine) this.miss(item, i);
    }

    if (this.started) this.refillSupplyTrain();
  }

  private miss(item: LaneObject, index: number): void {
    if (item.kind === 'ICE') {
      // Only call out a missed *reward* block; fillers stream past constantly
      // and would spam the screen.
      if (item.maxHp > BALANCE.LANE_FILLER_HP) {
        this.ctx.effects.floatingText(item.x, this.ctx.army.frontY - 30, 'MISSED', '#8a99b3', 24);
      }
      this.ctx.effects.impact(item.x, item.y, 0x5f6c82, 3);
    } else {
      // A barrier that gets through takes a bite out of the army.
      const lost = item.penalty;
      for (let i = 0; i < lost; i++) {
        this.ctx.army.damageAt(item.x, Number.POSITIVE_INFINITY);
      }
      this.ctx.effects.explosion(item.x, this.ctx.army.frontY, 150, 0xff5a5a);
      this.ctx.effects.floatingText(item.x, this.ctx.army.frontY - 50, `-${lost}`, '#ff5a5a', 40);
      this.ctx.effects.shake(0.014, 0.35);
      audio.play('gameover', 0.5);
    }
    void index;
    this.release(item);
  }

  private release(item: LaneObject): void {
    const index = this.active.indexOf(item);
    if (index >= 0) this.active.splice(index, 1);
    this.pool.release(item);
  }

  /* --------------------------------------------------------------- spawn -- */

  /** Keeps the supply lane stocked a screen-height ahead of the army. */
  private refillSupplyTrain(): void {
    // Keep the lane stocked a little past the top of the screen, so blocks are
    // always streaming into view.
    const ceiling = this.ctx.viewport.visibleTop - 240;
    let guard = 0;
    while (this.supplyTail > ceiling && guard++ < 4) {
      this.appendSupplyTrain();
    }
  }

  private appendSupplyTrain(): void {
    const rng = this.ctx.rng;
    const big = this.spawnIce(this.bigBlockHp(), BALANCE.LANE_BIG_BLOCK_HEIGHT, this.rollReward());
    if (!big) return;

    const fillers = rng.int(BALANCE.LANE_FILLER_COUNT[0], BALANCE.LANE_FILLER_COUNT[1]);
    for (let i = 0; i < fillers; i++) {
      this.spawnIce(BALANCE.LANE_FILLER_HP, BALANCE.LANE_FILLER_BLOCK_HEIGHT, {
        type: 'SOLDIERS',
        amount: BALANCE.LANE_FILLER_SOLDIERS,
      });
    }
  }

  /**
   * A block should cost roughly a second of the army's full attention, so it
   * stays a real decision at every army size instead of melting late on.
   */
  private bigBlockHp(): number {
    const dpsCost = this.ctx.combat.estimatedDps * BALANCE.LANE_BLOCK_DPS_SECONDS;
    const timeFloor =
      BALANCE.LANE_BLOCK_BASE_HP *
      (1 + this.ctx.runtime.elapsed * BALANCE.LANE_BLOCK_TIME_SCALING);
    return Math.max(BALANCE.LANE_BLOCK_BASE_HP, Math.round(Math.max(timeFloor, dpsCost)));
  }

  private rollReward(): LaneReward {
    const row = this.ctx.rng.weighted(BALANCE.LANE_REWARDS, (r) => r.weight);
    const pick = row ?? BALANCE.LANE_REWARDS[0];
    switch (pick.kind) {
      case 'DAMAGE':
        return { type: 'DAMAGE', percent: pick.percent ?? 8 };
      case 'FIRE_RATE':
        return { type: 'FIRE_RATE', percent: pick.percent ?? 6 };
      case 'DOUBLE_POINTS':
        return { type: 'DOUBLE_POINTS', seconds: pick.seconds ?? 10 };
      default:
        return { type: 'SOLDIERS', amount: pick.amount ?? 5 };
    }
  }

  private spawnIce(hp: number, height: number, reward: LaneReward): LaneObject | null {
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
    // Stack upward from the tail of the train.
    this.supplyTail -= height / 2 + BALANCE.LANE_BLOCK_GAP;
    item.y = this.supplyTail;
    this.supplyTail -= height / 2;

    item.hp = hp;
    item.maxHp = hp;
    item.reward = reward;
    item.penalty = 0;
    item.flash = 0;
    item.shownHp = -1;
    item.sequence = this.nextSequence++;

    item.sprite
      .setTexture(TEX.ice)
      .setVisible(true)
      .setDisplaySize(width, height)
      .setPosition(item.x, item.y)
      .setAlpha(0.95)
      .clearTint();

    item.icon
      .setVisible(true)
      .setText(rewardIcon(reward))
      .setFontSize(height > 90 ? 30 : 20);
    item.label
      .setVisible(true)
      .setFontSize(height > 90 ? 44 : 26)
      .setColor('#ffffff');

    this.active.push(item);
    return item;
  }

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
      BALANCE.BARRIER_BASE_HP,
      Math.round(this.ctx.combat.estimatedDps * BALANCE.BARRIER_DPS_SECONDS),
    );

    item.kind = 'BARRIER';
    item.lane = 'COMBAT';
    item.active = true;
    item.width = width;
    item.height = BALANCE.BARRIER_HEIGHT;
    item.x = viewport.combatLaneCenterX;
    item.y = viewport.visibleTop - 80;
    item.hp = hp;
    item.maxHp = hp;
    item.reward = null;
    item.penalty = clamp(
      Math.round(
        this.ctx.rng.range(BALANCE.BARRIER_PENALTY[0], BALANCE.BARRIER_PENALTY[1]),
      ),
      1,
      Math.max(1, this.ctx.army.count),
    );
    item.flash = 0;
    item.shownHp = -1;
    item.sequence = this.nextSequence++;

    item.sprite
      .setTexture(TEX.barrier)
      .setVisible(true)
      .setDisplaySize(width, item.height)
      .setPosition(item.x, item.y)
      .setAlpha(1)
      .clearTint();
    item.icon.setVisible(true).setText('⚠').setFontSize(22);
    item.label.setVisible(true).setFontSize(34).setColor('#ffd7d7');

    this.active.push(item);
  }

  reset(): void {
    for (let i = this.active.length - 1; i >= 0; i--) this.release(this.active[i]);
    this.supplyTail = this.ctx.army.frontY - 220;
    this.nextBarrierAt = BALANCE.BARRIER_FIRST_AT;
    this.started = false;
  }
}

function rewardIcon(reward: LaneReward): string {
  switch (reward.type) {
    case 'SOLDIERS':
      return '⚑';
    case 'DAMAGE':
      return '▲';
    case 'FIRE_RATE':
      return '⚡';
    case 'DOUBLE_POINTS':
      return '★';
  }
}

export type { Lane };
