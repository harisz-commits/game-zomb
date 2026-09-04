import { BALANCE } from '../config/BalanceConfig';
import { FIRING_COLUMN_HALF_WIDTH } from '../config/GameConfig';
import type { BattleContext } from '../core/BattleContext';
import { GameEvent } from '../core/EventBus';
import type { Soldier } from '../entities/Soldier';
import type { LaneObject } from '../entities/LaneObject';
import type { Zombie } from '../entities/Zombie';
import type { ModifierState } from '../types/game';
import { audio } from './AudioSystem';

interface NapalmZone {
  x: number;
  y: number;
  radius: number;
  life: number;
  dps: number;
}

interface PendingStrike {
  delay: number;
  damage: number;
  radius: number;
}

/**
 * All offensive logic: hitscan resolution, crits, pierce, explosions and every
 * timed/counter based special from the upgrade pool.
 *
 * Combat is deliberately *hitscan*: a shot resolves instantly and only a
 * fraction of shots spawn a visual tracer (see QualityManager). That keeps the
 * feeling of overwhelming firepower without thousands of projectile objects.
 */
export class CombatSystem {
  private shotCounter = 0;
  private hitCounter = 0;

  private gatlingHits = 0;
  private gatlingTimer = 0;

  private railgunTimer: number = BALANCE.RAILGUN_INTERVAL;
  private grenadierTimer: number = BALANCE.GRENADIER_INTERVAL;
  private artilleryTimer: number = BALANCE.ARTILLERY_INTERVAL;
  private endlessArmyTimer: number = BALANCE.ENDLESS_ARMY_INTERVAL;
  private shieldTimer: number = BALANCE.EMERGENCY_SHIELD_INTERVAL;

  private killChainBonus = 0;
  private killsSinceRecruit = 0;

  private readonly napalmZones: NapalmZone[] = [];
  private readonly pendingStrikes: PendingStrike[] = [];

  // Separate scratch buffers: a hit can trigger an explosion which itself
  // queries enemies, so a single shared array would be corrupted mid-iteration.
  private readonly rayScratch: Zombie[] = [];
  private readonly ricochetScratch: Zombie[] = [];
  private readonly napalmScratch: Zombie[] = [];
  private readonly explodeScratch: Zombie[][] = [[], [], [], []];
  private ricochetDepth = 0;

  private shotsThisFrame = 0;
  private smoothedShotRate = 0;

  constructor(private readonly ctx: BattleContext) {
    this.ctx.events.on(GameEvent.ENEMY_KILLED, (payload) => this.onEnemyKilled(payload));
  }

  /** Rough army DPS, used by the debug overlay only. */
  get estimatedDps(): number {
    const mods = this.ctx.upgrades.modifiers;
    const critFactor = 1 + this.critChance(mods) * (mods.critMultiplier - 1);
    return this.ctx.army.count * this.fireRate(mods) * this.ctx.army.soldierDamage * critFactor;
  }

  get currentFireRate(): number {
    return this.fireRate(this.ctx.upgrades.modifiers);
  }

  /* --------------------------------------------------------------- rates -- */

  private critChance(mods: ModifierState): number {
    return Math.min(1, mods.critChance + this.killChainBonus);
  }

  private fireRate(mods: ModifierState): number {
    let rate = BALANCE.BASE_FIRE_RATE * mods.fireRateMultiplier;

    if (
      mods.specials.has('OVERDRIVE') &&
      this.ctx.enemies.activeCount >= BALANCE.OVERDRIVE_ZOMBIE_COUNT
    ) {
      rate *= 1 + BALANCE.OVERDRIVE_FIRE_RATE;
    }
    if (mods.specials.has('LAST_STAND') && this.ctx.army.count < BALANCE.LAST_STAND_THRESHOLD) {
      rate *= 1 + BALANCE.LAST_STAND_FIRE_RATE;
    }
    if (this.gatlingTimer > 0) rate *= 1 + BALANCE.GATLING_FIRE_RATE;

    return Math.max(0.15, rate);
  }

  /* -------------------------------------------------------------- update -- */

  update(dt: number): void {
    const mods = this.ctx.upgrades.modifiers;

    this.shotsThisFrame = 0;
    this.updateTimers(dt, mods);
    this.updateNapalm(dt);
    this.updateStrikes(dt);
    this.fireSoldiers(dt, mods);

    // Aggregate gunfire for the audio system - never one voice per shot.
    const instantRate = dt > 0 ? this.shotsThisFrame / dt : 0;
    this.smoothedShotRate += (instantRate - this.smoothedShotRate) * Math.min(1, dt * 8);
    this.ctx.runtime.gunfireRate = this.smoothedShotRate;
    audio.setGunfireIntensity(this.smoothedShotRate, this.ctx.army.tierPower);
  }

  private updateTimers(dt: number, mods: ModifierState): void {
    if (this.gatlingTimer > 0) this.gatlingTimer -= dt;

    if (this.killChainBonus > 0) {
      this.killChainBonus = Math.max(0, this.killChainBonus - BALANCE.KILL_CHAIN_DECAY * dt);
    }

    if (mods.specials.has('RAILGUN_DOCTRINE')) {
      this.railgunTimer -= dt;
      if (this.railgunTimer <= 0) {
        this.railgunTimer = BALANCE.RAILGUN_INTERVAL;
        this.fireRailgun(mods);
      }
    }

    if (mods.specials.has('GRENADIER')) {
      this.grenadierTimer -= dt;
      if (this.grenadierTimer <= 0) {
        this.grenadierTimer = BALANCE.GRENADIER_INTERVAL;
        this.throwGrenade();
      }
    }

    if (mods.specials.has('ARTILLERY')) {
      this.artilleryTimer -= dt;
      if (this.artilleryTimer <= 0) {
        this.artilleryTimer = BALANCE.ARTILLERY_INTERVAL;
        this.callArtillery();
      }
    }

    if (mods.specials.has('ENDLESS_ARMY')) {
      this.endlessArmyTimer -= dt;
      if (this.endlessArmyTimer <= 0) {
        this.endlessArmyTimer = BALANCE.ENDLESS_ARMY_INTERVAL;
        if (this.ctx.army.addSoldiers(1) > 0) audio.play('reinforce', 0.6);
      }
    }

    if (mods.specials.has('EMERGENCY_SHIELD')) {
      this.shieldTimer -= dt;
      if (this.shieldTimer <= 0) {
        const fortress = mods.doctrineLevels.DEFENSE > 0;
        this.shieldTimer = fortress
          ? BALANCE.FORTRESS_SHIELD_INTERVAL
          : BALANCE.EMERGENCY_SHIELD_INTERVAL;
        this.ctx.army.activateShield(
          fortress ? BALANCE.FORTRESS_SHIELD_DURATION : BALANCE.EMERGENCY_SHIELD_DURATION,
        );
      }
    }
  }

  private updateNapalm(dt: number): void {
    for (let i = this.napalmZones.length - 1; i >= 0; i--) {
      const zone = this.napalmZones[i];
      zone.life -= dt;
      if (zone.life <= 0) {
        this.napalmZones.splice(i, 1);
        continue;
      }
      const hits = this.ctx.enemies.collectInRadius(
        zone.x,
        zone.y,
        zone.radius,
        this.napalmScratch,
      );
      for (const z of hits) this.ctx.enemies.applyBurn(z, zone.dps, BALANCE.NAPALM_TICK * 2);
    }
  }

  private updateStrikes(dt: number): void {
    for (let i = this.pendingStrikes.length - 1; i >= 0; i--) {
      const strike = this.pendingStrikes[i];
      strike.delay -= dt;
      if (strike.delay > 0) continue;
      this.pendingStrikes.splice(i, 1);
      const target = this.findDensestCluster(strike.radius);
      if (target) this.explode(target.x, target.y, strike.damage, strike.radius, 0);
    }
  }

  /* --------------------------------------------------------------- firing -- */

  /**
   * Soldiers fire straight ahead, so the lane the formation stands in decides
   * what it shoots. This is the whole game in one method:
   *
   *   left  -> the frozen supply block (reward, but the horde keeps walking)
   *   right -> the horde and its penalty barriers (safe, but the block is lost)
   *
   * A wide formation can straddle the divider and split its fire, which is the
   * skilful middle option.
   */
  private fireSoldiers(dt: number, mods: ModifierState): void {
    const army = this.ctx.army;
    if (army.count === 0) return;

    const interval = 1 / this.fireRate(mods);
    const range = army.range;
    const quality = this.ctx.quality.settings;
    const rng = this.ctx.rng;
    const viewport = this.ctx.viewport;
    const lanes = this.ctx.laneObjects;

    const supplyBlock = lanes.supplyFront;
    const barrier = lanes.combatFront;

    for (const soldier of army.soldiers) {
      soldier.cooldown -= dt;
      if (soldier.cooldown > 0) continue;

      if (viewport.isSupplyLane(soldier.x)) {
        // --- supply lane -------------------------------------------------
        if (!supplyBlock || !supplyBlock.active || soldier.y - supplyBlock.y > range) {
          soldier.cooldown = 0.12;
          continue;
        }
        soldier.cooldown = interval * rng.range(0.88, 1.12);
        this.fireAtLaneObject(soldier, supplyBlock, mods, quality.tracerFraction);
        continue;
      }

      // --- combat lane ---------------------------------------------------
      soldier.targetTimer -= dt;
      if (!soldier.target || !soldier.target.active || soldier.targetTimer <= 0) {
        soldier.target = this.ctx.enemies.findForwardTarget(
          soldier.x,
          soldier.y,
          range,
          FIRING_COLUMN_HALF_WIDTH,
        );
        soldier.targetTimer = BALANCE.TARGET_REFRESH * rng.range(0.8, 1.2);
      }

      const zombie = soldier.target && soldier.target.active ? soldier.target : null;
      const barrierInReach =
        barrier && barrier.active && soldier.y - barrier.y <= range ? barrier : null;

      // Whatever is closest to the line is the immediate threat.
      const shootBarrier =
        barrierInReach !== null && (zombie === null || barrierInReach.y > zombie.y);

      if (!zombie && !shootBarrier) {
        soldier.cooldown = 0.1;
        continue;
      }

      soldier.cooldown = interval * rng.range(0.88, 1.12);

      if (shootBarrier && barrierInReach) {
        this.fireAtLaneObject(soldier, barrierInReach, mods, quality.tracerFraction);
        continue;
      }
      if (!zombie) continue;

      this.fireShot(soldier, zombie, mods, quality.tracerFraction);

      if (mods.doubleTapChance > 0 && rng.bool(mods.doubleTapChance)) {
        this.fireShot(soldier, zombie, mods, quality.tracerFraction * 0.5);
      }

      if (mods.specials.has('BULLET_STORM')) {
        this.shotCounter++;
        if (this.shotCounter % BALANCE.BULLET_STORM_EVERY === 0) {
          for (let i = 0; i < BALANCE.BULLET_STORM_SHOTS; i++) {
            if (!zombie.active) break;
            this.fireShot(soldier, zombie, mods, quality.tracerFraction * 0.6);
          }
        }
      }
    }
  }

  /**
   * A shot into a lane object (supply block or barrier). These are big static
   * targets, so there is no crit/pierce/explosion resolution - just damage,
   * which keeps breaking a block readable as a pure "time spent" cost.
   */
  private fireAtLaneObject(
    soldier: Soldier,
    item: LaneObject,
    mods: ModifierState,
    tracerFraction: number,
  ): void {
    this.shotsThisFrame++;
    this.ctx.runtime.totalShots++;

    let damage = this.ctx.army.soldierDamage;
    if (this.ctx.rng.bool(this.critChance(mods))) damage *= mods.critMultiplier;

    if (this.ctx.rng.next() < tracerFraction) {
      const color = item.kind === 'ICE' ? 0x9fe3ff : 0xffb0ac;
      this.ctx.effects.tracer(soldier.x, soldier.y - 8, item.x, item.bottom, color, 1);
      this.ctx.effects.muzzle(soldier.x + 6, soldier.y - 14, this.ctx.army.currentTier.muzzleColor);
    }

    this.ctx.laneObjects.applyDamage(item, damage);
  }

  private fireShot(
    soldier: Soldier,
    target: Zombie,
    mods: ModifierState,
    tracerFraction: number,
  ): void {
    const rng = this.ctx.rng;
    this.shotsThisFrame++;
    this.ctx.runtime.totalShots++;

    let damage = this.ctx.army.soldierDamage;
    let crit = rng.bool(this.critChance(mods));
    let critBonusMultiplier = 1;
    let pierce = mods.pierce;

    // --- guaranteed-crit specials -------------------------------------
    if (mods.specials.has('PERFECT_SHOT')) {
      this.hitCounter++;
      if (this.hitCounter % BALANCE.PERFECT_SHOT_EVERY === 0) {
        crit = true;
        critBonusMultiplier = BALANCE.PERFECT_SHOT_MULT;
      }
    }
    if (mods.doctrineLevels.PRECISION > 0) {
      if (this.ctx.runtime.totalShots % BALANCE.SNIPER_EVERY === 0) {
        crit = true;
        critBonusMultiplier = Math.max(critBonusMultiplier, BALANCE.SNIPER_DAMAGE_MULT);
      }
    }
    if (
      mods.specials.has('INFINITE_PENETRATION') &&
      this.ctx.runtime.totalShots % BALANCE.INFINITE_PENETRATION_EVERY === 0
    ) {
      pierce = Number.POSITIVE_INFINITY;
    }

    if (crit) damage *= mods.critMultiplier * critBonusMultiplier;

    // --- visuals (only a fraction of shots) ----------------------------
    const drawTracer = rng.next() < tracerFraction;
    if (drawTracer) {
      const color = crit ? 0xffd166 : this.ctx.army.currentTier.muzzleColor;
      this.ctx.effects.tracer(soldier.x, soldier.y - 8, target.x, target.y, color, crit ? 1.8 : 1);
      this.ctx.effects.muzzle(soldier.x + 6, soldier.y - 14, this.ctx.army.currentTier.muzzleColor);
    }

    // --- resolve the hit(s) --------------------------------------------
    if (pierce <= 0) {
      this.hitEnemy(target, damage, crit, mods);
      return;
    }

    const hits = this.collectAlongRay(soldier.x, soldier.y, target, this.ctx.army.range, pierce);
    for (const z of hits) {
      if (!z.active) continue;
      this.hitEnemy(z, damage, crit, mods);
    }
  }

  /**
   * Collects enemies intersecting the shot line, nearest first.
   * Only used when the build actually has pierce - the common no-pierce case
   * skips this entirely.
   */
  private collectAlongRay(
    x: number,
    y: number,
    target: Zombie,
    range: number,
    pierce: number,
  ): Zombie[] {
    const dx = target.x - x;
    const dy = target.y - y;
    const length = Math.max(1, Math.hypot(dx, dy));
    const nx = dx / length;
    const ny = dy / length;

    const result = this.rayScratch;
    result.length = 0;

    for (const z of this.ctx.enemies.active) {
      const ox = z.x - x;
      const oy = z.y - y;
      const along = ox * nx + oy * ny;
      if (along < 0 || along > range) continue;
      const perp = Math.abs(ox * -ny + oy * nx);
      if (perp > z.radius + 4) continue;
      result.push(z);
    }

    result.sort((a, b) => {
      const da = (a.x - x) * nx + (a.y - y) * ny;
      const db = (b.x - x) * nx + (b.y - y) * ny;
      return da - db;
    });

    const maxHits = Number.isFinite(pierce) ? 1 + pierce : result.length;
    if (result.length > maxHits) result.length = maxHits;
    return result;
  }

  /** Applies a single bullet hit including armor, execute and on-hit effects. */
  private hitEnemy(z: Zombie, rawDamage: number, crit: boolean, mods: ModifierState): void {
    const rng = this.ctx.rng;
    let damage = rawDamage;

    if (z.armor > 0) {
      // Flat armor with a floor so nothing is ever fully immune.
      damage = Math.max(damage * 0.15, damage - z.armor);
    }
    if (z.kind === 'ARMORED') damage *= mods.armoredDamageMultiplier;
    if (z.boss) damage *= mods.bossDamageMultiplier;

    // Execute: below the threshold, a hit simply finishes the enemy.
    if (mods.executeThreshold > 0 && z.hpRatio <= mods.executeThreshold) {
      damage = z.hp;
    }

    const killed = this.ctx.enemies.applyDamage(z, damage, { crit });

    if (mods.doctrineLevels.FIREPOWER > 0) {
      this.gatlingHits++;
      if (this.gatlingHits >= BALANCE.GATLING_HITS_REQUIRED) {
        this.gatlingHits = 0;
        this.gatlingTimer = BALANCE.GATLING_DURATION;
        this.ctx.effects.floatingText(
          this.ctx.army.formationX,
          this.ctx.army.frontY - 40,
          'SPIN UP',
          '#ff8a4c',
          22,
        );
      }
    }

    if (!killed) {
      if (mods.knockbackChance > 0 && rng.bool(mods.knockbackChance)) {
        this.ctx.enemies.applyKnockback(z, BALANCE.KNOCKBACK_FORCE);
      }
      if (mods.ricochetChance > 0 && rng.bool(mods.ricochetChance)) {
        this.ricochet(z, rawDamage * 0.6, mods);
      }
    }

    if (mods.explosionChance > 0 && rng.bool(mods.explosionChance)) {
      this.explode(z.x, z.y, rawDamage * BALANCE.BASE_EXPLOSION_DAMAGE_RATIO, BALANCE.BASE_EXPLOSION_RADIUS, 0);
    }
  }

  private ricochet(from: Zombie, damage: number, mods: ModifierState): void {
    if (this.ricochetDepth >= 1) return; // one bounce per bullet
    const hits = this.ctx.enemies.collectInRadius(
      from.x,
      from.y,
      BALANCE.RICOCHET_RANGE,
      this.ricochetScratch,
    );
    for (const z of hits) {
      if (z === from || !z.active) continue;
      this.ctx.effects.tracer(from.x, from.y, z.x, z.y, 0x6fd6ff, 1);
      this.ricochetDepth++;
      this.hitEnemy(z, damage, false, mods);
      this.ricochetDepth--;
      return;
    }
  }

  /* ---------------------------------------------------------- explosions -- */

  explode(x: number, y: number, damage: number, baseRadius: number, depth: number): void {
    const mods = this.ctx.upgrades.modifiers;
    const radius = baseRadius * mods.explosionRadiusMultiplier;
    const finalDamage = damage * mods.explosionDamageMultiplier;

    this.ctx.effects.explosion(x, y, radius, 0xffb648);
    this.ctx.events.emit(GameEvent.EXPLOSION, { x, y, radius });
    if (depth === 0) audio.play('explosion', 0.7);

    if (mods.specials.has('NAPALM')) {
      const dps = finalDamage * BALANCE.NAPALM_DPS_RATIO;
      this.napalmZones.push({ x, y, radius: radius * 0.8, life: BALANCE.NAPALM_DURATION, dps });
      this.ctx.effects.zone(x, y, radius * 0.8, BALANCE.NAPALM_DURATION);
    }

    // Chained explosions mutate the active list, so each depth gets its own
    // buffer instead of sharing one scratch array.
    const buffer = this.explodeScratch[Math.min(depth, this.explodeScratch.length - 1)];
    const hits = this.ctx.enemies.collectInRadius(x, y, radius, buffer);
    for (const z of hits) {
      if (!z.active) continue;
      let dmg = finalDamage;
      if (z.kind === 'ARMORED') dmg *= mods.armoredDamageMultiplier;
      if (z.boss) dmg *= mods.bossDamageMultiplier;

      const zx = z.x;
      const zy = z.y;
      const killed = this.ctx.enemies.applyDamage(z, dmg, { explosion: true });

      if (
        killed &&
        mods.specials.has('CHAIN_REACTION') &&
        depth < BALANCE.CHAIN_REACTION_DEPTH &&
        this.ctx.rng.bool(BALANCE.CHAIN_REACTION_CHANCE)
      ) {
        this.explode(zx, zy, finalDamage * 0.65, baseRadius * 0.85, depth + 1);
      }
    }
  }

  /* ------------------------------------------------------------- specials -- */

  private fireRailgun(mods: ModifierState): void {
    const army = this.ctx.army;
    const x = army.formationX;
    const topY = this.ctx.viewport.visibleTop;
    const damage = army.soldierDamage * BALANCE.RAILGUN_DAMAGE_MULT;

    this.ctx.effects.tracer(x, army.frontY, x, topY, 0x6fd6ff, 8);
    this.ctx.effects.shake(0.01, 0.25);
    audio.play('heavygun', 1);

    for (const z of this.ctx.enemies.active.slice()) {
      if (Math.abs(z.x - x) > 46 + z.radius) continue;
      let dmg = damage;
      if (z.boss) dmg *= mods.bossDamageMultiplier;
      this.ctx.enemies.applyDamage(z, dmg, { crit: true });
    }
  }

  private throwGrenade(): void {
    const target = this.findDensestCluster(BALANCE.BASE_EXPLOSION_RADIUS);
    if (!target) return;
    this.explode(
      target.x,
      target.y,
      this.ctx.army.soldierDamage * BALANCE.GRENADIER_DAMAGE_MULT,
      BALANCE.BASE_EXPLOSION_RADIUS,
      0,
    );
  }

  private callArtillery(): void {
    const damage = this.ctx.army.soldierDamage * BALANCE.ARTILLERY_DAMAGE_MULT;
    const radius = BALANCE.BASE_EXPLOSION_RADIUS * BALANCE.ARTILLERY_RADIUS_MULT;
    for (let i = 0; i < BALANCE.ARTILLERY_STRIKES; i++) {
      this.pendingStrikes.push({ delay: i * 0.25, damage, radius });
    }
    this.ctx.effects.floatingText(
      this.ctx.army.formationX,
      this.ctx.army.frontY - 70,
      'ARTILLERY',
      '#ffb648',
      26,
    );
  }

  /**
   * Cheap "largest group" heuristic: sample a bounded number of enemies and
   * count neighbours. Deterministic enough for gameplay, O(n) in practice.
   */
  private findDensestCluster(radius: number): { x: number; y: number } | null {
    const enemies = this.ctx.enemies.active;
    if (enemies.length === 0) return null;

    const sampleCount = Math.min(enemies.length, 16);
    const step = Math.max(1, Math.floor(enemies.length / sampleCount));
    const rSq = radius * radius;

    let bestX = enemies[0].x;
    let bestY = enemies[0].y;
    let bestScore = -1;

    for (let i = 0; i < enemies.length; i += step) {
      const candidate = enemies[i];
      let score = 0;
      for (const other of enemies) {
        const dx = other.x - candidate.x;
        const dy = other.y - candidate.y;
        if (dx * dx + dy * dy <= rSq) score++;
      }
      // Slightly favour clusters closer to the line - they are the threat.
      score += candidate.y / 400;
      if (score > bestScore) {
        bestScore = score;
        bestX = candidate.x;
        bestY = candidate.y;
      }
    }
    return { x: bestX, y: bestY };
  }

  /* ---------------------------------------------------------- kill hooks -- */

  private onEnemyKilled(payload: {
    elite: boolean;
    boss: boolean;
    byCrit: boolean;
    x: number;
    y: number;
  }): void {
    const mods = this.ctx.upgrades.modifiers;

    if (mods.specials.has('KILL_CHAIN') && payload.byCrit) {
      this.killChainBonus = Math.min(
        BALANCE.KILL_CHAIN_MAX,
        this.killChainBonus + BALANCE.KILL_CHAIN_CRIT_ADD,
      );
    }

    if (mods.specials.has('RECRUITER')) {
      this.killsSinceRecruit++;
      if (this.killsSinceRecruit >= BALANCE.RECRUITER_EVERY_KILLS) {
        this.killsSinceRecruit = 0;
        if (this.ctx.army.addSoldiers(1) > 0) audio.play('reinforce', 0.5);
      }
    }

    if (
      mods.specials.has('BATTLEFIELD_COMMISSION') &&
      payload.elite &&
      this.ctx.rng.bool(BALANCE.BATTLEFIELD_COMMISSION_CHANCE)
    ) {
      this.ctx.army.addSoldiers(1);
    }
  }

  reset(): void {
    this.shotCounter = 0;
    this.hitCounter = 0;
    this.gatlingHits = 0;
    this.gatlingTimer = 0;
    this.railgunTimer = BALANCE.RAILGUN_INTERVAL;
    this.grenadierTimer = BALANCE.GRENADIER_INTERVAL;
    this.artilleryTimer = BALANCE.ARTILLERY_INTERVAL;
    this.endlessArmyTimer = BALANCE.ENDLESS_ARMY_INTERVAL;
    this.shieldTimer = BALANCE.EMERGENCY_SHIELD_INTERVAL;
    this.killChainBonus = 0;
    this.killsSinceRecruit = 0;
    this.napalmZones.length = 0;
    this.pendingStrikes.length = 0;
    this.smoothedShotRate = 0;
  }
}
