import Phaser from 'phaser';
import { BALANCE } from '../config/BalanceConfig';
import { ENTITY_LIMITS } from '../config/GameConfig';
import type { BattleContext } from '../core/BattleContext';
import { GameEvent } from '../core/EventBus';
import { Zombie } from '../entities/Zombie';
import { BOSS_BEHAVIOUR, ENEMY_DEFINITIONS } from '../data/enemyDefinitions';
import { TEX } from '../render/TextureFactory';
import type { EnemyKind } from '../types/game';
import { clamp, mixColor } from '../utils/MathUtils';
import { ObjectPool } from '../utils/ObjectPool';
import { audio } from './AudioSystem';

interface Spit {
  sprite: Phaser.GameObjects.Image;
  x: number;
  y: number;
  vx: number;
  vy: number;
  damage: number;
  active: boolean;
}

export interface DamageOptions {
  crit?: boolean;
  explosion?: boolean;
  /** Suppresses the damage number (used for tick damage like napalm). */
  silent?: boolean;
}

const ELITE_TINT = 0xff7ad1;
const FLASH_DURATION = 0.05;
const FLASH_COOLDOWN = 0.17;
/** Colour distant units fade toward. Warmer than the sky so they stay legible. */
const HAZE_TINT = 0x3b4759;
/** Haze is written in steps so a walking zombie is not re-tinted every frame. */
const HAZE_STEPS = 10;

/**
 * Spawns, moves, and kills enemies.
 *
 * Enemies are pooled and simulated with plain arithmetic. A per-frame column
 * bucket index gives soldiers an O(1)-ish nearest-target lookup instead of
 * scanning the whole horde 140 times.
 */
export class EnemySystem {
  private readonly pool: ObjectPool<Zombie>;
  readonly active: Zombie[] = [];

  private readonly spitPool: ObjectPool<Spit>;
  private readonly activeSpits: Spit[] = [];

  private readonly buckets: Zombie[][] = [];
  private bucketLeft = 0;
  private bucketWidth = 1;

  currentBoss: Zombie | null = null;

  constructor(private readonly ctx: BattleContext) {
    this.pool = new ObjectPool<Zombie>(
      () => this.createZombie(),
      (z) => {
        z.active = false;
        z.sprite.setVisible(false);
      },
      ENTITY_LIMITS.maxActiveZombies,
      40,
    );

    this.spitPool = new ObjectPool<Spit>(
      () => {
        const sprite = this.ctx.scene.add.image(0, 0, TEX.spit).setVisible(false).setDepth(35);
        this.ctx.worldLayer.add(sprite);
        return { sprite, x: 0, y: 0, vx: 0, vy: 0, damage: 0, active: false };
      },
      (s) => {
        s.active = false;
        s.sprite.setVisible(false);
      },
      ENTITY_LIMITS.maxSpits,
      6,
    );

    for (let i = 0; i < BALANCE.TARGET_BUCKETS; i++) this.buckets.push([]);
  }

  private createZombie(): Zombie {
    const zombie = new Zombie();
    // Contact shadows are baked into the sprites (see TextureFactory), so a
    // zombie is a single quad no matter what the quality level is.
    zombie.sprite = this.ctx.scene.add
      .image(0, 0, 'zombie_walker')
      .setVisible(false)
      .setDepth(25);
    this.ctx.worldLayer.add(zombie.sprite);
    return zombie;
  }

  get activeCount(): number {
    return this.active.length;
  }

  /* --------------------------------------------------------------- spawn -- */

  spawn(kind: EnemyKind, elite: boolean, x?: number, y?: number): Zombie | null {
    const zombie = this.pool.obtain();
    if (!zombie) return null;

    const def = ENEMY_DEFINITIONS[kind];
    const viewport = this.ctx.viewport;
    const margin = def.radius + 24;

    const hpMult = this.ctx.director.getHpMultiplier(this.ctx.runtime.elapsed);
    const speedMult = this.ctx.director.getSpeedMultiplier(this.ctx.runtime.elapsed);

    zombie.def = def;
    zombie.kind = kind;
    zombie.active = true;
    zombie.boss = def.klass === 'BOSS';
    zombie.elite = elite && !zombie.boss;

    // The horde owns the right-hand lane; the left lane is for supply blocks.
    zombie.x =
      x ??
      this.ctx.rng.range(
        viewport.combatLaneLeft + margin,
        viewport.combatLaneRight - margin,
      );
    zombie.y = y ?? viewport.spawnY - this.ctx.rng.range(0, 90);
    // Funnel tight enough that a small squad can cover the column.
    zombie.driftX = this.ctx.rng.range(-55, 55);

    const eliteHp = zombie.elite ? BALANCE.ELITE_HP_MULT : 1;
    zombie.maxHp = def.hp * hpMult * eliteHp;
    zombie.hp = zombie.maxHp;
    zombie.speed = def.speed * speedMult;
    zombie.damage = def.damage * (zombie.elite ? BALANCE.ELITE_DAMAGE_MULT : 1);
    zombie.attackInterval = def.attackInterval;
    zombie.attackTimer = this.ctx.rng.range(0, def.attackInterval);
    zombie.armor = def.armor;
    zombie.points = zombie.elite ? BALANCE.ELITE_POINTS : def.points;
    zombie.score = zombie.elite ? BALANCE.ELITE_SCORE : def.score;
    zombie.radius = def.radius * (zombie.elite ? BALANCE.ELITE_SCALE : 1);
    zombie.stability = def.stability;
    zombie.knockback = 0;
    zombie.flash = 0;
    zombie.flashCooldown = 0;
    zombie.bobPhase = this.ctx.rng.range(0, Math.PI * 2);
    zombie.burnTimer = 0;
    zombie.burnDps = 0;
    zombie.burnTick = 0;
    zombie.engaged = false;
    zombie.abilityTimer = zombie.boss ? 3 : 0;
    zombie.phaseIndex = 0;

    zombie.baseScale = zombie.elite ? BALANCE.ELITE_SCALE : 1;
    zombie.fogStep = -1;

    const depth = viewport.depthScale(zombie.y);
    zombie.sprite
      .setTexture(def.texture)
      .setVisible(true)
      .setPosition(viewport.projectX(zombie.x, zombie.y), zombie.y)
      .setScale(zombie.baseScale * depth)
      .setAlpha(1);

    this.applyHaze(zombie, true);

    this.active.push(zombie);
    return zombie;
  }

  spawnBoss(kind: EnemyKind, hpScale = 1): Zombie | null {
    const boss = this.spawn(
      kind,
      false,
      this.ctx.viewport.combatLaneCenterX,
      this.ctx.viewport.spawnY - 60,
    );
    if (!boss) return null;

    boss.maxHp *= hpScale;
    boss.hp = boss.maxHp;
    boss.sprite.setScale(1).setAlpha(0);

    this.currentBoss = boss;
    this.ctx.runtime.bossActive = true;
    this.ctx.events.emit(GameEvent.BOSS_SPAWNED, { name: boss.def.name });
    audio.play('bossspawn');

    // Boss entrance: fade + impact, no long cutscene.
    this.ctx.scene.tweens.add({
      targets: boss.sprite,
      alpha: 1,
      duration: 420,
      ease: 'Quad.easeOut',
    });
    this.ctx.effects.shake(0.012, 0.6);
    return boss;
  }

  /** Spawns a pack of swarmers so hordes read as a wave, not a drizzle. */
  private spawnPack(kind: EnemyKind, elite: boolean, size: number): number {
    const viewport = this.ctx.viewport;
    const anchor = this.ctx.rng.range(
      viewport.combatLaneLeft + 40,
      viewport.combatLaneRight - 40,
    );
    let spawned = 0;
    for (let i = 0; i < size; i++) {
      const z = this.spawn(
        kind,
        elite && i === 0,
        clamp(
          anchor + this.ctx.rng.range(-70, 70),
          viewport.combatLaneLeft + 16,
          viewport.combatLaneRight - 16,
        ),
        viewport.spawnY - this.ctx.rng.range(0, 70),
      );
      if (z) spawned++;
    }
    return spawned;
  }

  /** Consumes the director's budget and spawns accordingly. */
  private updateSpawning(dt: number): void {
    const runtime = this.ctx.runtime;
    if (runtime.over) return;

    const budget = this.ctx.director.update(dt, {
      elapsed: runtime.elapsed,
      armyPower: this.ctx.army.armyPower,
      promotionCount: this.ctx.promotion.promotions,
      kills: this.ctx.score.kills,
      armySize: this.ctx.army.count,
      activeZombies: this.active.length,
    });

    if (this.active.length >= BALANCE.MAX_ZOMBIES) return;

    const orders = this.ctx.director.planSpawns(
      budget,
      BALANCE.SPAWN_BURST_CAP,
      BALANCE.MAX_ZOMBIES - this.active.length,
      (kind) =>
        kind === 'SWARMER'
          ? this.ctx.rng.int(BALANCE.SWARM_PACK_SIZE[0], BALANCE.SWARM_PACK_SIZE[1])
          : 1,
    );

    let spent = 0;
    for (const order of orders) {
      const spawned =
        order.count > 1
          ? this.spawnPack(order.kind, order.elite, order.count)
          : this.spawn(order.kind, order.elite)
            ? 1
            : 0;
      if (spawned === 0) break; // pool exhausted
      spent += order.cost;
    }

    if (spent > 0) this.ctx.director.consumeBudget(spent);
  }

  /* -------------------------------------------------------------- update -- */

  update(dt: number): void {
    this.updateSpawning(dt);

    const army = this.ctx.army;
    const viewport = this.ctx.viewport;
    const frontY = army.frontY;
    const laneCentre = viewport.combatLaneCenterX;
    const bob = this.ctx.quality.settings.enemyBob;

    this.rebuildBuckets();

    for (let i = this.active.length - 1; i >= 0; i--) {
      const z = this.active[i];

      // Burning (napalm) damage over time.
      if (z.burnTimer > 0) {
        z.burnTimer -= dt;
        z.burnTick -= dt;
        if (z.burnTick <= 0) {
          z.burnTick = BALANCE.NAPALM_TICK;
          this.applyDamage(z, z.burnDps * BALANCE.NAPALM_TICK, { silent: true });
          if (!z.active) continue;
        }
      }

      const stopY = frontY - (z.isRanged ? z.def.standoff : z.radius + BALANCE.ENEMY_CONTACT_PADDING);

      if (z.knockback !== 0) {
        z.y += z.knockback * dt;
        z.knockback *= Math.exp(-6 * dt);
        if (Math.abs(z.knockback) < 3) z.knockback = 0;
      }

      if (z.y < stopY) {
        z.engaged = false;
        z.y += z.speed * dt;
        // Home on the centre of the *combat lane*, not on the army. If the
        // horde followed the formation it would walk into the supply lane and
        // the whole left/right decision would collapse.
        const desiredX = laneCentre + z.driftX;
        z.x += (desiredX - z.x) * Math.min(1, dt * 0.8);
      } else {
        z.y = Math.min(z.y, stopY);
        z.engaged = true;
        this.updateAttack(z, dt);
      }

      if (z.boss) this.updateBoss(z, dt);

      const sprite = z.sprite;
      const depth = viewport.depthScale(z.y);
      const projectedX = viewport.projectX(z.x, z.y);
      sprite.x = projectedX;
      sprite.y = bob ? z.y + Math.sin(z.bobPhase + this.ctx.runtime.elapsed * 7) * 1.5 : z.y;
      sprite.setScale(z.baseScale * depth);

      if (z.flashCooldown > 0) z.flashCooldown -= dt;
      if (z.flash > 0) {
        z.flash -= dt;
        if (z.flash <= 0) this.applyHaze(z, true);
      } else {
        this.applyHaze(z, false);
      }


      // Cull anything that somehow slipped past the line.
      if (z.y > frontY + 320) this.release(i);
    }

    this.updateSpits(dt);
  }

  private updateAttack(z: Zombie, dt: number): void {
    z.attackTimer -= dt;
    if (z.attackTimer > 0) return;
    z.attackTimer = z.attackInterval;

    if (z.isRanged) {
      this.fireSpit(z);
      return;
    }
    const killed = this.ctx.army.damageAt(z.x, z.damage);
    if (!killed) this.ctx.effects.impact(z.x, this.ctx.army.frontY, 0x8fb0d8, 1);
  }

  private fireSpit(z: Zombie): void {
    const spit = this.spitPool.obtain();
    if (!spit) return;
    const targetY = this.ctx.army.frontY + 10;
    const targetX = this.ctx.army.formationX + this.ctx.rng.range(-60, 60);
    const dx = targetX - z.x;
    const dy = targetY - z.y;
    const length = Math.max(1, Math.hypot(dx, dy));

    spit.active = true;
    spit.x = z.x;
    spit.y = z.y;
    spit.vx = (dx / length) * BALANCE.SPIT_SPEED;
    spit.vy = (dy / length) * BALANCE.SPIT_SPEED;
    spit.damage = z.damage * BALANCE.SPIT_DAMAGE_RATIO;
    spit.sprite
      .setVisible(true)
      .setPosition(this.ctx.viewport.projectX(z.x, z.y), z.y)
      .setScale(this.ctx.viewport.depthScale(z.y));
    this.activeSpits.push(spit);
  }

  private updateSpits(dt: number): void {
    const frontY = this.ctx.army.frontY;
    for (let i = this.activeSpits.length - 1; i >= 0; i--) {
      const spit = this.activeSpits[i];
      spit.x += spit.vx * dt;
      spit.y += spit.vy * dt;
      spit.sprite
        .setPosition(this.ctx.viewport.projectX(spit.x, spit.y), spit.y)
        .setScale(this.ctx.viewport.depthScale(spit.y));

      if (spit.y >= frontY) {
        this.ctx.army.damageAt(spit.x, spit.damage);
        this.ctx.effects.impact(spit.x, spit.y, 0xa8d05f, 3);
        this.spitPool.release(spit);
        this.activeSpits.splice(i, 1);
      } else if (spit.y > this.ctx.viewport.visibleBottom + 50) {
        this.spitPool.release(spit);
        this.activeSpits.splice(i, 1);
      }
    }
  }

  private updateBoss(z: Zombie, dt: number): void {
    z.abilityTimer -= dt;

    if (z.kind === 'BOSS_CRUSHER') {
      const cfg = BOSS_BEHAVIOUR.BOSS_CRUSHER;
      if (z.abilityTimer <= 0 && z.engaged) {
        z.abilityTimer = cfg.shockwaveInterval;
        this.ctx.effects.explosion(z.x, z.y + 40, cfg.shockwaveRadius, 0xff6b6b);
        this.ctx.effects.shake(0.014, 0.35);
        audio.play('explosion', 0.8);
        // Slams hit several soldiers across the width of the wave.
        const hits = 4;
        for (let i = 0; i < hits; i++) {
          const offset = (i / (hits - 1) - 0.5) * cfg.shockwaveRadius;
          this.ctx.army.damageAt(z.x + offset, cfg.shockwaveDamage);
        }
      }
      return;
    }

    if (z.kind === 'BOSS_ABOMINATION') {
      const cfg = BOSS_BEHAVIOUR.BOSS_ABOMINATION;
      const ratio = z.hpRatio;
      const nextPhase = cfg.phaseThresholds[z.phaseIndex];
      if (nextPhase !== undefined && ratio <= nextPhase) {
        z.phaseIndex++;
        z.speed *= 1 + cfg.phaseSpeedBonus;
        this.ctx.effects.explosion(z.x, z.y, 140, 0x9fd06a);
        this.ctx.effects.floatingText(z.x, z.y - 60, 'ENRAGED', '#d9ff7a', 26);
      }
      if (z.abilityTimer <= 0) {
        z.abilityTimer = cfg.spawnInterval * (1 - z.phaseIndex * cfg.phaseSpawnSpeedup);
        for (let i = 0; i < cfg.spawnCount; i++) {
          this.spawn(
            'SWARMER',
            false,
            z.x + this.ctx.rng.range(-70, 70),
            z.y + this.ctx.rng.range(-10, 30),
          );
        }
      }
    }
  }

  /**
   * Atmospheric perspective. Distant units fade toward the haze colour, which
   * is what makes a shrunken sprite read as "far away" rather than "small".
   *
   * Written in quantised steps: a per-frame tint write for 150 units is a lot
   * of churn for a value that changes slowly.
   */
  private applyHaze(z: Zombie, force: boolean): void {
    const fog = this.ctx.viewport.fogAlpha(z.y);
    const step = Math.round(fog * HAZE_STEPS);
    if (!force && step === z.fogStep) return;
    z.fogStep = step;
    const base = z.elite ? ELITE_TINT : 0xffffff;
    z.sprite.setTint(mixColor(base, HAZE_TINT, step / HAZE_STEPS));
  }

  /* --------------------------------------------------------------- query -- */

  private rebuildBuckets(): void {
    const viewport = this.ctx.viewport;
    this.bucketLeft = viewport.visibleLeft;
    this.bucketWidth = Math.max(
      1,
      (viewport.visibleRight - viewport.visibleLeft) / BALANCE.TARGET_BUCKETS,
    );
    for (const bucket of this.buckets) bucket.length = 0;

    for (const z of this.active) {
      const index = clamp(
        Math.floor((z.x - this.bucketLeft) / this.bucketWidth),
        0,
        BALANCE.TARGET_BUCKETS - 1,
      );
      this.buckets[index].push(z);
    }
  }

  /**
   * Nearest enemy a soldier can hit *firing straight ahead*.
   *
   * Soldiers no longer sweep the whole field: they engage what is in their own
   * column (plus a small forgiving cone). That is what turns "where do I
   * stand" into the game's central decision - point the formation at the horde
   * and the supply block drifts past, point it left and the horde closes in.
   */
  findForwardTarget(x: number, y: number, range: number, halfWidth: number): Zombie | null {
    const centre = clamp(
      Math.floor((x - this.bucketLeft) / this.bucketWidth),
      0,
      BALANCE.TARGET_BUCKETS - 1,
    );
    // A column can straddle at most a couple of buckets.
    const spread = Math.max(1, Math.ceil(halfWidth / this.bucketWidth));

    let best: Zombie | null = null;
    let bestY = -Infinity;

    for (let offset = -spread; offset <= spread; offset++) {
      const index = centre + offset;
      if (index < 0 || index >= BALANCE.TARGET_BUCKETS) continue;

      for (const z of this.buckets[index]) {
        if (!z.active) continue;
        if (Math.abs(z.x - x) > halfWidth + z.radius) continue;
        if (z.y > y) continue; // already past the line
        if (y - z.y > range) continue;
        // Closest to the line wins - that is the one about to hurt you.
        if (z.y > bestY) {
          bestY = z.y;
          best = z;
        }
      }
    }
    return best;
  }

  /** Enemies intersecting a circle - used by explosions and artillery. */
  collectInRadius(x: number, y: number, radius: number, out: Zombie[]): Zombie[] {
    out.length = 0;
    const rSq = radius * radius;
    for (const z of this.active) {
      const dx = z.x - x;
      const dy = z.y - y;
      if (dx * dx + dy * dy <= rSq + z.radius * z.radius) out.push(z);
    }
    return out;
  }

  /* -------------------------------------------------------------- damage -- */

  applyDamage(z: Zombie, amount: number, options: DamageOptions = {}): boolean {
    if (!z.active || amount <= 0) return false;

    z.hp -= amount;
    // A boss takes ~100 hits/second late in a run; without the cooldown the
    // flash never clears and the sprite reads as a white silhouette.
    if (z.flashCooldown <= 0) {
      z.flash = FLASH_DURATION;
      z.flashCooldown = FLASH_COOLDOWN;
      z.sprite.setTintFill(0xffffff);
    }

    if (!options.silent) {
      this.ctx.events.emit(GameEvent.ENEMY_DAMAGED, {
        x: z.x,
        y: z.y,
        amount,
        crit: options.crit === true,
      });
    }

    if (z.hp <= 0) {
      this.kill(z, options.explosion === true, options.crit === true);
      return true;
    }
    return false;
  }

  applyKnockback(z: Zombie, force: number): void {
    if (z.stability >= 1) return;
    z.knockback -= force * (1 - z.stability);
  }

  applyBurn(z: Zombie, dps: number, duration: number): void {
    z.burnDps = Math.max(z.burnDps, dps);
    z.burnTimer = Math.max(z.burnTimer, duration);
  }

  kill(z: Zombie, byExplosion: boolean, byCrit: boolean): void {
    if (!z.active) return;
    const index = this.active.indexOf(z);
    if (index < 0) return;

    const payload = {
      kind: z.kind,
      elite: z.elite,
      boss: z.boss,
      x: z.x,
      y: z.y,
      points: z.points,
      score: z.score,
      byExplosion,
      byCrit,
    };

    if (z.boss) {
      this.ctx.effects.explosion(z.x, z.y, 220, 0xffb648);
      this.ctx.effects.shake(0.018, 0.5);
      this.currentBoss = null;
      this.ctx.runtime.bossActive = false;
      this.ctx.events.emit(GameEvent.BOSS_KILLED, { name: z.def.name });
    } else {
      this.ctx.effects.impact(z.x, z.y, z.elite ? ELITE_TINT : 0x9fb87f, z.elite ? 7 : 3);
    }

    this.release(index);
    this.ctx.events.emit(GameEvent.ENEMY_KILLED, payload);
  }

  private release(index: number): void {
    const z = this.active[index];
    this.pool.release(z);
    this.active.splice(index, 1);
  }

  clear(killAll = false): void {
    for (let i = this.active.length - 1; i >= 0; i--) {
      if (killAll) this.kill(this.active[i], false, false);
      else this.release(i);
    }
    for (let i = this.activeSpits.length - 1; i >= 0; i--) {
      this.spitPool.release(this.activeSpits[i]);
      this.activeSpits.splice(i, 1);
    }
    if (!killAll) {
      this.currentBoss = null;
      this.ctx.runtime.bossActive = false;
    }
  }
}
