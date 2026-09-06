import { BALANCE } from '../config/BalanceConfig';
import { ENEMY_SPAWN_COST } from '../data/enemyDefinitions';
import {
  CAMPAIGN_PHASES,
  ENDLESS_BASE_PHASE,
  ENDLESS_MODIFIERS,
  createEndlessModifierState,
  getPhaseAt,
} from '../data/waveDefinitions';
import type { EnemyKind, EndlessModifierState, GameMode, WavePhase } from '../types/game';
import { clamp } from '../utils/MathUtils';
import type { SeededRandom } from '../utils/SeededRandom';

export interface DirectorSnapshot {
  elapsed: number;
  armyPower: number;
  promotionCount: number;
  kills: number;
  armySize: number;
  activeZombies: number;
}

/** One planned spawn: a single enemy, or a pack of `count` of them. */
export interface SpawnOrder {
  kind: EnemyKind;
  count: number;
  /** Total budget cost of the whole order. */
  cost: number;
  elite: boolean;
}

export interface DirectorEvents {
  onPhase?: (phase: WavePhase) => void;
  onModifier?: (label: string) => void;
}

/**
 * Decides *how much* pressure the battlefield is under.
 *
 * Difficulty is primarily a function of time. Army power feeds in only gently
 * (`POWER_SCALING`, capped) - the player must be able to feel that a great
 * build genuinely breaks the game open, so there is no aggressive rubber-band.
 */
export class EnemyDirector {
  private mode: GameMode = 'CAMPAIGN';
  private phaseIndex = -1;
  private currentPhase: WavePhase = CAMPAIGN_PHASES[0];
  private endless: EndlessModifierState = createEndlessModifierState();
  private nextModifierAt = 0;
  private appliedModifierIds: string[] = [];
  private budget = 0;

  constructor(
    private readonly rng: SeededRandom,
    private readonly events: DirectorEvents = {},
  ) {}

  start(mode: GameMode): void {
    this.mode = mode;
    this.phaseIndex = -1;
    this.currentPhase = mode === 'ENDLESS' ? ENDLESS_BASE_PHASE : CAMPAIGN_PHASES[0];
    this.endless = createEndlessModifierState();
    this.appliedModifierIds = [];
    this.budget = 0;
    this.nextModifierAt =
      mode === 'ENDLESS'
        ? this.rng.range(BALANCE.ENDLESS_MODIFIER_INTERVAL[0], BALANCE.ENDLESS_MODIFIER_INTERVAL[1])
        : Infinity;
  }

  get phase(): WavePhase {
    return this.currentPhase;
  }

  get endlessModifiers(): readonly string[] {
    return this.appliedModifierIds;
  }

  get modifierState(): EndlessModifierState {
    return this.endless;
  }

  /** Raw difficulty number used by the HUD/debug overlay. */
  difficulty(elapsed: number): number {
    return 1 + elapsed * BALANCE.DIFFICULTY_SCALING * 10;
  }

  /**
   * Advances phases/modifiers and accumulates a spawn budget.
   * Returns the number of "cost units" available for spawning this frame.
   */
  update(dt: number, snapshot: DirectorSnapshot): number {
    this.updatePhase(snapshot.elapsed);
    this.updateEndlessModifiers(snapshot.elapsed);

    const rate = this.spawnRate(snapshot);
    this.budget += rate * dt;

    // Keep the accumulated budget bounded so a pause can never cause a burst.
    const cap = BALANCE.SPAWN_BURST_CAP;
    if (this.budget > cap) this.budget = cap;
    return this.budget;
  }

  consumeBudget(amount: number): void {
    this.budget = Math.max(0, this.budget - amount);
  }

  /** Enemy cost units per second. */
  spawnRate(snapshot: DirectorSnapshot): number {
    const timeFactor = 1 + snapshot.elapsed * BALANCE.DIFFICULTY_SCALING;

    // Army power relative to a 10-rookie starting force.
    const basePower = BALANCE.STARTING_SOLDIERS;
    const relative = Math.max(1, snapshot.armyPower / basePower);
    const powerFactor = clamp(
      1 + Math.log2(relative) * BALANCE.POWER_SCALING,
      1,
      1 + BALANCE.POWER_SCALING_CAP,
    );

    const rate =
      BALANCE.BASE_SPAWN_RATE *
      timeFactor *
      powerFactor *
      this.currentPhase.intensity *
      this.endless.spawnRateMultiplier;

    return Math.min(rate, BALANCE.SPAWN_RATE_CAP);
  }

  /** Composition weights for the current phase, incl. endless modifiers. */
  getWeights(): Partial<Record<EnemyKind, number>> {
    const source = this.currentPhase.weights;
    const weights: Partial<Record<EnemyKind, number>> = {};
    for (const key of Object.keys(source) as EnemyKind[]) {
      let value = source[key] ?? 0;
      if (key === 'ARMORED') value *= this.endless.armoredWeightMultiplier;
      if (key === 'RUNNER') value *= this.endless.runnerWeightMultiplier;
      weights[key] = value;
    }
    return weights;
  }

  getEliteChance(): number {
    return clamp(this.currentPhase.eliteChance + this.endless.eliteChanceAdd, 0, 0.45);
  }

  /**
   * HP multiplier applied to every spawned enemy.
   *
   * Two terms. Time is the floor, but the one that matters is *tier power*:
   * a soldier's damage is proportional to it, so without this term the horde
   * became irrelevant the moment the promotion ladder got going - eight
   * promotions in a five minute run meant the army hit 256x harder than the
   * enemies it was shooting.
   *
   * The exponent is deliberately below 1, so a promotion is still a real gain
   * (`tierPower^(1 - exponent)` net, plus the army regrowing afterwards) - it
   * just is not a free win.
   */
  getHpMultiplier(elapsed: number, tierPower = 1): number {
    const overTime = Math.pow(
      1 + elapsed / BALANCE.ZOMBIE_HP_SCALING_TIME,
      BALANCE.ZOMBIE_HP_SCALING_POWER,
    );
    const withPower = Math.pow(
      Math.max(1, tierPower),
      BALANCE.ZOMBIE_HP_TIER_EXPONENT,
    );
    return overTime * withPower * this.endless.hpMultiplier;
  }

  /**
   * Damage multiplier applied to every spawned enemy.
   *
   * Soldier HP is proportional to tier power, so without the matching term
   * here a zombie that reached the line stopped being able to kill anyone the
   * moment the army promoted once - the line held itself and the run played
   * out on rails. Same exponent as HP, for the same reason.
   */
  getDamageMultiplier(tierPower = 1): number {
    return Math.pow(Math.max(1, tierPower), BALANCE.ZOMBIE_HP_TIER_EXPONENT);
  }

  getSpeedMultiplier(elapsed: number): number {
    const scaled =
      1 +
      Math.min(
        BALANCE.ZOMBIE_SPEED_SCALING_CAP,
        (elapsed / 60) * BALANCE.ZOMBIE_SPEED_SCALING,
      );
    return scaled * this.endless.speedMultiplier;
  }

  costOf(kind: EnemyKind): number {
    return ENEMY_SPAWN_COST[kind] ?? 1;
  }

  /**
   * Decides what to spawn for the available budget.
   *
   * Kept pure with respect to the scene so the budget arithmetic can be unit
   * tested. The guarantee it must uphold: the summed `cost` of the returned
   * orders never exceeds `budget`, and the summed `count` never exceeds
   * `capacity`. A pack therefore has to be priced *before* it is committed -
   * pricing it afterwards let packs overdraw the budget, and because
   * `consumeBudget` clamps at zero the overdraft was silently forgiven.
   */
  planSpawns(
    budget: number,
    maxOrders: number,
    capacity: number,
    packSizeFor: (kind: EnemyKind) => number,
  ): SpawnOrder[] {
    const orders: SpawnOrder[] = [];
    if (budget <= 0 || capacity <= 0 || maxOrders <= 0) return orders;

    const weights = this.getWeights();
    const kinds = (Object.keys(weights) as EnemyKind[]).filter((k) => (weights[k] ?? 0) > 0);
    if (kinds.length === 0) return orders;

    const cheapest = kinds.reduce((min, k) => Math.min(min, this.costOf(k)), Infinity);
    const eliteChance = this.getEliteChance();

    let spent = 0;
    let planned = 0;

    while (orders.length < maxOrders && budget - spent >= cheapest && planned < capacity) {
      const kind = this.rng.weighted(kinds, (k) => weights[k] ?? 0);
      if (!kind) break;

      const count = Math.max(1, Math.min(packSizeFor(kind), capacity - planned));
      const cost = this.costOf(kind) * count;
      if (cost > budget - spent) break;

      orders.push({ kind, count, cost, elite: this.rng.bool(eliteChance) });
      spent += cost;
      planned += count;
    }
    return orders;
  }

  private updatePhase(elapsed: number): void {
    if (this.mode === 'ENDLESS') {
      this.currentPhase = ENDLESS_BASE_PHASE;
      return;
    }
    const phase = getPhaseAt(elapsed);
    const index = CAMPAIGN_PHASES.indexOf(phase);
    if (index !== this.phaseIndex) {
      this.phaseIndex = index;
      this.currentPhase = phase;
      this.events.onPhase?.(phase);
    }
  }

  private updateEndlessModifiers(elapsed: number): void {
    if (this.mode !== 'ENDLESS') return;
    if (elapsed < this.nextModifierAt) return;

    const modifier = this.rng.pick(ENDLESS_MODIFIERS);
    modifier.apply(this.endless);
    this.appliedModifierIds.push(modifier.id);
    this.events.onModifier?.(modifier.label);

    this.nextModifierAt =
      elapsed +
      this.rng.range(
        BALANCE.ENDLESS_MODIFIER_INTERVAL[0],
        BALANCE.ENDLESS_MODIFIER_INTERVAL[1],
      );
  }
}
