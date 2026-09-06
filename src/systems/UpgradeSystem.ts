import { BALANCE } from '../config/BalanceConfig';
import { UPGRADE_DEFINITIONS, UPGRADES_BY_ID } from '../data/upgradeDefinitions';
import type {
  ModifierState,
  Rarity,
  UpgradeDefinition,
  UpgradeEffects,
  UpgradeFamily,
} from '../types/game';
import { UPGRADE_FAMILIES } from '../types/game';
import { MAX_WEAPON_LEVEL, getWeaponTier, type WeaponTier } from '../data/weaponTiers';
import type { SeededRandom } from '../utils/SeededRandom';
import { DoctrineSystem, type DoctrineUnlock } from './DoctrineSystem';

const RARITY_ORDER: Rarity[] = ['COMMON', 'RARE', 'EPIC', 'LEGENDARY'];

export function createBaseModifierState(): ModifierState {
  return {
    damageMultiplier: 1,
    fireRateMultiplier: 1,
    critChance: BALANCE.BASE_CRIT_CHANCE,
    critMultiplier: BALANCE.BASE_CRIT_MULTIPLIER,
    pierce: BALANCE.BASE_PIERCE,
    rangeMultiplier: 1,
    reinforcementMultiplier: 1,
    supplyDropMultiplier: 1,
    explosionChance: 0,
    explosionRadiusMultiplier: 1,
    explosionDamageMultiplier: 1,
    bossDamageMultiplier: 1,
    armoredDamageMultiplier: 1,
    executeThreshold: 0,
    hpMultiplier: 1,
    regenPerSecond: 0,
    knockbackChance: 0,
    doubleTapChance: 0,
    ricochetChance: 0,
    promotionThresholdDelta: 0,
    specials: new Set(),
    doctrineLevels: {
      FIREPOWER: 0,
      BALLISTICS: 0,
      PRECISION: 0,
      EXPLOSIVES: 0,
      COMMAND: 0,
      DEFENSE: 0,
    },
  };
}

/** Folds one effect block into an accumulating modifier state. */
export function applyEffects(state: ModifierState, effects: UpgradeEffects): void {
  if (effects.damageMultiplier !== undefined) state.damageMultiplier *= effects.damageMultiplier;
  if (effects.fireRateMultiplier !== undefined)
    state.fireRateMultiplier *= effects.fireRateMultiplier;
  if (effects.critChanceAdd !== undefined) state.critChance += effects.critChanceAdd;
  if (effects.critMultiplierAdd !== undefined) state.critMultiplier += effects.critMultiplierAdd;
  if (effects.pierceAdd !== undefined) state.pierce += effects.pierceAdd;
  if (effects.rangeMultiplier !== undefined) state.rangeMultiplier *= effects.rangeMultiplier;
  if (effects.reinforcementMultiplier !== undefined)
    state.reinforcementMultiplier *= effects.reinforcementMultiplier;
  if (effects.supplyDropMultiplier !== undefined)
    state.supplyDropMultiplier *= effects.supplyDropMultiplier;
  if (effects.explosionChanceAdd !== undefined) state.explosionChance += effects.explosionChanceAdd;
  if (effects.explosionRadiusMultiplier !== undefined)
    state.explosionRadiusMultiplier *= effects.explosionRadiusMultiplier;
  if (effects.explosionDamageMultiplier !== undefined)
    state.explosionDamageMultiplier *= effects.explosionDamageMultiplier;
  if (effects.bossDamageMultiplier !== undefined)
    state.bossDamageMultiplier *= effects.bossDamageMultiplier;
  if (effects.armoredDamageMultiplier !== undefined)
    state.armoredDamageMultiplier *= effects.armoredDamageMultiplier;
  if (effects.executeThreshold !== undefined)
    state.executeThreshold = Math.max(state.executeThreshold, effects.executeThreshold);
  if (effects.hpMultiplier !== undefined) state.hpMultiplier *= effects.hpMultiplier;
  if (effects.regenPerSecondAdd !== undefined) state.regenPerSecond += effects.regenPerSecondAdd;
  if (effects.knockbackChanceAdd !== undefined)
    state.knockbackChance += effects.knockbackChanceAdd;
  if (effects.doubleTapChanceAdd !== undefined)
    state.doubleTapChance += effects.doubleTapChanceAdd;
  if (effects.ricochetChanceAdd !== undefined) state.ricochetChance += effects.ricochetChanceAdd;
  if (effects.promotionThresholdDelta !== undefined)
    state.promotionThresholdDelta += effects.promotionThresholdDelta;
  if (effects.specials) {
    for (const special of effects.specials) state.specials.add(special);
  }
}

export interface DraftResult {
  choices: UpgradeDefinition[];
  /** True when the pity system forced a minimum rarity into this draft. */
  pityApplied: boolean;
}

/**
 * Owns the drafted build: which cards are owned at what level, which cards can
 * still appear, and the aggregated `ModifierState` every combat system reads.
 */
export class UpgradeSystem {
  readonly doctrines = new DoctrineSystem();

  private readonly levels = new Map<string, number>();
  /**
   * Effects granted outside the card draft - currently supply-block rewards.
   * They aggregate through exactly the same path as cards, so nothing
   * downstream needs to know where a bonus came from.
   */
  private readonly bonusEffects: UpgradeEffects[] = [];
  /**
   * Weapon tier. Separate from the card pool on purpose: it is granted by
   * weapon crates, it is capped, and above all it is the one upgrade the
   * player can *see* - the gun in every soldier's hands changes with it.
   */
  private weaponLevel = 0;
  private mods: ModifierState = createBaseModifierState();
  private pool: UpgradeDefinition[];

  constructor(
    private readonly rng: SeededRandom,
    pool: UpgradeDefinition[] = UPGRADE_DEFINITIONS,
  ) {
    this.pool = pool;
  }

  get modifiers(): ModifierState {
    return this.mods;
  }

  get weapon(): WeaponTier {
    return getWeaponTier(this.weaponLevel);
  }

  get weaponIndex(): number {
    return this.weaponLevel;
  }

  get weaponMaxed(): boolean {
    return this.weaponLevel >= MAX_WEAPON_LEVEL;
  }

  /** Advances to the next weapon. Returns null when already at the top. */
  upgradeWeapon(): WeaponTier | null {
    if (this.weaponMaxed) return null;
    this.weaponLevel++;
    this.recompute();
    return this.weapon;
  }

  getLevel(id: string): number {
    return this.levels.get(id) ?? 0;
  }

  getOwned(): { definition: UpgradeDefinition; level: number }[] {
    const owned: { definition: UpgradeDefinition; level: number }[] = [];
    for (const [id, level] of this.levels) {
      const def = UPGRADES_BY_ID.get(id) ?? this.pool.find((u) => u.id === id);
      if (def) owned.push({ definition: def, level });
    }
    return owned;
  }

  /** Card is draftable: below max level, prerequisites met, not locked out. */
  isAvailable(def: UpgradeDefinition): boolean {
    if (this.getLevel(def.id) >= def.maxLevel) return false;

    if (def.prerequisites) {
      for (const req of def.prerequisites) {
        if (this.getLevel(req) <= 0) return false;
      }
    }
    if (def.prerequisitesAny && def.prerequisitesAny.length > 0) {
      let satisfied = false;
      for (const req of def.prerequisitesAny) {
        if (this.getLevel(req) > 0) {
          satisfied = true;
          break;
        }
      }
      if (!satisfied) return false;
    }
    if (def.incompatibleWith) {
      for (const other of def.incompatibleWith) {
        if (this.getLevel(other) > 0) return false;
      }
    }
    return true;
  }

  getAvailable(): UpgradeDefinition[] {
    return this.pool.filter((def) => this.isAvailable(def));
  }

  /** Rarity distribution for a given (1-based) promotion index. */
  getRarityWeights(promotionIndex: number): Record<Rarity, number> {
    for (const row of BALANCE.RARITY_TABLE) {
      if (promotionIndex <= row.untilPromotion) {
        return { ...row.weights } as Record<Rarity, number>;
      }
    }
    const last = BALANCE.RARITY_TABLE[BALANCE.RARITY_TABLE.length - 1];
    return { ...last.weights } as Record<Rarity, number>;
  }

  /**
   * Produces `count` distinct upgrade choices for a promotion.
   * Honours max level, prerequisites, incompatibilities, rarity weights and
   * the pity system (guaranteed Epic every 5th, Legendary every 10th).
   */
  generateChoices(promotionIndex: number, count = BALANCE.UPGRADE_CHOICES): DraftResult {
    const available = this.getAvailable();
    const chosen: UpgradeDefinition[] = [];
    const remaining = available.slice();

    let forcedRarity: Rarity | null = null;
    if (promotionIndex > 0 && promotionIndex % BALANCE.PITY_LEGENDARY_EVERY === 0) {
      forcedRarity = 'LEGENDARY';
    } else if (promotionIndex > 0 && promotionIndex % BALANCE.PITY_EPIC_EVERY === 0) {
      forcedRarity = 'EPIC';
    }

    let pityApplied = false;
    if (forcedRarity) {
      const picked = this.pickOfRarityAtLeast(remaining, forcedRarity);
      if (picked) {
        chosen.push(picked);
        this.removeFrom(remaining, picked);
        pityApplied = true;
      }
    }

    const weights = this.getRarityWeights(promotionIndex);
    while (chosen.length < count && remaining.length > 0) {
      const rarity = this.rollRarity(weights, remaining);
      const picked = this.pickOfRarity(remaining, rarity);
      if (!picked) break;
      chosen.push(picked);
      this.removeFrom(remaining, picked);
    }

    // Shuffle so the pity card is not always in slot 1.
    this.rng.shuffle(chosen);
    return { choices: chosen, pityApplied };
  }

  /** Adds a non-card bonus (e.g. a supply-block reward) to the run. */
  addBonus(effects: UpgradeEffects): void {
    this.bonusEffects.push(effects);
    this.recompute();
  }

  /** Registers a drafted card and recomputes all modifiers. */
  apply(def: UpgradeDefinition): DoctrineUnlock | null {
    this.levels.set(def.id, this.getLevel(def.id) + 1);
    const unlock = this.doctrines.registerCard(def.family);
    this.recompute();
    return unlock;
  }

  /** Rebuilds the aggregated modifier state from owned cards + doctrines. */
  recompute(): void {
    const state = createBaseModifierState();

    for (const [id, level] of this.levels) {
      const def = UPGRADES_BY_ID.get(id) ?? this.pool.find((u) => u.id === id);
      if (!def) continue;
      for (let i = 0; i < level; i++) applyEffects(state, def.effects);
    }

    for (const effects of this.doctrines.collectEffects()) applyEffects(state, effects);
    for (const effects of this.bonusEffects) applyEffects(state, effects);

    const weapon = getWeaponTier(this.weaponLevel);
    state.damageMultiplier *= weapon.damageMultiplier;
    state.fireRateMultiplier *= weapon.fireRateMultiplier;

    for (const family of UPGRADE_FAMILIES) {
      state.doctrineLevels[family] = this.doctrines.getLevel(family);
    }

    this.mods = state;
  }

  reset(): void {
    this.levels.clear();
    this.bonusEffects.length = 0;
    this.weaponLevel = 0;
    this.doctrines.reset();
    this.mods = createBaseModifierState();
  }

  // ------------------------------------------------------------- helpers ---

  private removeFrom(list: UpgradeDefinition[], def: UpgradeDefinition): void {
    const index = list.indexOf(def);
    if (index >= 0) list.splice(index, 1);
  }

  /** Rolls a rarity, skipping buckets that have no draftable card left. */
  private rollRarity(weights: Record<Rarity, number>, pool: UpgradeDefinition[]): Rarity {
    const usable = RARITY_ORDER.filter(
      (r) => (weights[r] ?? 0) > 0 && pool.some((d) => d.rarity === r),
    );
    if (usable.length === 0) {
      return pool.length > 0 ? pool[0].rarity : 'COMMON';
    }
    const picked = this.rng.weighted(usable, (r) => weights[r] ?? 0);
    return picked ?? usable[0];
  }

  private pickOfRarity(pool: UpgradeDefinition[], rarity: Rarity): UpgradeDefinition | null {
    const candidates = pool.filter((d) => d.rarity === rarity);
    if (candidates.length === 0) return pool.length > 0 ? this.pickWeighted(pool) : null;
    return this.pickWeighted(candidates);
  }

  /** Picks the requested rarity or better; falls back downward if empty. */
  private pickOfRarityAtLeast(
    pool: UpgradeDefinition[],
    rarity: Rarity,
  ): UpgradeDefinition | null {
    const minIndex = RARITY_ORDER.indexOf(rarity);
    const candidates = pool.filter((d) => RARITY_ORDER.indexOf(d.rarity) >= minIndex);
    if (candidates.length > 0) return this.pickWeighted(candidates);

    for (let i = minIndex - 1; i >= 0; i--) {
      const fallback = pool.filter((d) => d.rarity === RARITY_ORDER[i]);
      if (fallback.length > 0) return this.pickWeighted(fallback);
    }
    return null;
  }

  private pickWeighted(pool: UpgradeDefinition[]): UpgradeDefinition | null {
    return this.rng.weighted(pool, (d) => d.weight);
  }
}

export type { UpgradeFamily };
