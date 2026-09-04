/**
 * Shared, engine-agnostic game types.
 *
 * Nothing in this file may import Phaser - it is consumed by pure logic
 * systems that run inside the unit test suite (node environment).
 */

export type GameMode = 'CAMPAIGN' | 'ENDLESS';

export type Rarity = 'COMMON' | 'RARE' | 'EPIC' | 'LEGENDARY';

export type UpgradeFamily =
  | 'FIREPOWER'
  | 'BALLISTICS'
  | 'PRECISION'
  | 'EXPLOSIVES'
  | 'COMMAND'
  | 'DEFENSE';

export const UPGRADE_FAMILIES: readonly UpgradeFamily[] = [
  'FIREPOWER',
  'BALLISTICS',
  'PRECISION',
  'EXPLOSIVES',
  'COMMAND',
  'DEFENSE',
];

export type EnemyKind =
  | 'WALKER'
  | 'RUNNER'
  | 'BRUTE'
  | 'ARMORED'
  | 'SWARMER'
  | 'SPITTER'
  | 'BOSS_CRUSHER'
  | 'BOSS_ABOMINATION';

export type EnemyClass = 'NORMAL' | 'BOSS';

/** Identifier of a special effect that needs its own handler in a system. */
export type SpecialId =
  | 'DOUBLE_TAP'
  | 'BULLET_STORM'
  | 'OVERDRIVE'
  | 'RICOCHET'
  | 'INFINITE_PENETRATION'
  | 'RAILGUN_DOCTRINE'
  | 'EXECUTION'
  | 'PERFECT_SHOT'
  | 'KILL_CHAIN'
  | 'GRENADIER'
  | 'CHAIN_REACTION'
  | 'NAPALM'
  | 'ARTILLERY'
  | 'RECRUITER'
  | 'EARLY_PROMOTION'
  | 'BATTLEFIELD_COMMISSION'
  | 'ENDLESS_ARMY'
  | 'COMBAT_MEDIC'
  | 'EMERGENCY_SHIELD'
  | 'LAST_STAND'
  | 'GUARDIAN_PROTOCOL'
  | 'SHOCKWAVE';

/**
 * Modular, purely additive/multiplicative upgrade effects.
 * Every field is optional; the aggregation in `UpgradeSystem` knows how to
 * combine each one (multipliers multiply, "*Add" fields sum, thresholds max).
 */
export interface UpgradeEffects {
  damageMultiplier?: number;
  fireRateMultiplier?: number;
  critChanceAdd?: number;
  critMultiplierAdd?: number;
  pierceAdd?: number;
  rangeMultiplier?: number;
  reinforcementMultiplier?: number;
  supplyDropMultiplier?: number;
  explosionChanceAdd?: number;
  explosionRadiusMultiplier?: number;
  explosionDamageMultiplier?: number;
  bossDamageMultiplier?: number;
  armoredDamageMultiplier?: number;
  executeThreshold?: number;
  hpMultiplier?: number;
  regenPerSecondAdd?: number;
  knockbackChanceAdd?: number;
  doubleTapChanceAdd?: number;
  ricochetChanceAdd?: number;
  promotionThresholdDelta?: number;
  /** Special behaviours that need bespoke handlers. */
  specials?: SpecialId[];
}

export interface UpgradeDefinition {
  id: string;
  name: string;
  description: string;
  rarity: Rarity;
  family: UpgradeFamily;
  /** How often the same card can be drafted in a single run. */
  maxLevel: number;
  /** Relative draw weight inside its rarity bucket. */
  weight: number;
  /** Upgrade ids that must ALL already be owned. */
  prerequisites?: string[];
  /** At least one of these upgrade ids must already be owned. */
  prerequisitesAny?: string[];
  /** Upgrade ids that lock this one out. */
  incompatibleWith?: string[];
  effects: UpgradeEffects;
}

export interface DoctrineDefinition {
  id: string;
  family: UpgradeFamily;
  name: string;
  description: string;
  /** Effects applied at doctrine level 1. */
  level1: UpgradeEffects;
  /** Additional effects applied when level 2 is reached (6 cards). */
  level2: UpgradeEffects;
}

/** Fully aggregated run modifiers, recomputed whenever the build changes. */
export interface ModifierState {
  damageMultiplier: number;
  fireRateMultiplier: number;
  critChance: number;
  critMultiplier: number;
  pierce: number;
  rangeMultiplier: number;
  reinforcementMultiplier: number;
  supplyDropMultiplier: number;
  explosionChance: number;
  explosionRadiusMultiplier: number;
  explosionDamageMultiplier: number;
  bossDamageMultiplier: number;
  armoredDamageMultiplier: number;
  executeThreshold: number;
  hpMultiplier: number;
  regenPerSecond: number;
  knockbackChance: number;
  doubleTapChance: number;
  ricochetChance: number;
  promotionThresholdDelta: number;
  specials: Set<SpecialId>;
  /** 0 = not unlocked, 1 or 2 = doctrine level. */
  doctrineLevels: Record<UpgradeFamily, number>;
}

export interface SoldierTier {
  id: string;
  /** Plural label shown in the HUD, e.g. "VETERANS". */
  name: string;
  /** Singular label used in the promotion banner. */
  singular: string;
  /** Relative combat power - drives promotion math and per-soldier stats. */
  power: number;
  /** Prestige star count (0 for the named tiers). */
  prestige: number;
  /** Index into the generated placeholder texture set (0..5). */
  visual: number;
  bodyColor: number;
  helmetColor: number;
  weaponColor: number;
  accentColor: number;
  muzzleColor: number;
}

export interface EnemyDefinition {
  kind: EnemyKind;
  name: string;
  klass: EnemyClass;
  hp: number;
  speed: number;
  /** Contact damage per attack tick. */
  damage: number;
  /** Seconds between melee attacks. */
  attackInterval: number;
  /** Flat damage reduction against non-piercing bullets. */
  armor: number;
  /** Reinforcement points granted on death. */
  points: number;
  /** Score value granted on death. */
  score: number;
  /** Display radius in world units - drives collision + sprite scale. */
  radius: number;
  /** Stops this far above the army front line (ranged units). */
  standoff: number;
  /** Ranged attacker (spitter / boss projectiles). */
  ranged?: boolean;
  /** Knockback resistance, 0..1 (1 = immune). */
  stability: number;
  texture: string;
  tint: number;
}

export interface WavePhase {
  /** Phase starts at this elapsed time (seconds). */
  at: number;
  label: string;
  /** Multiplies the director's spawn budget. */
  intensity: number;
  /** Relative spawn weights per enemy kind. */
  weights: Partial<Record<EnemyKind, number>>;
  /** Chance that a spawned enemy is upgraded to an elite variant. */
  eliteChance: number;
  /** One-off event fired when the phase begins. */
  event?: 'ELITE_ENCOUNTER' | 'MINI_BOSS' | 'FINAL_BOSS';
}

export interface EndlessModifier {
  id: string;
  label: string;
  apply(state: EndlessModifierState): void;
}

export interface EndlessModifierState {
  hpMultiplier: number;
  speedMultiplier: number;
  spawnRateMultiplier: number;
  eliteChanceAdd: number;
  armoredWeightMultiplier: number;
  runnerWeightMultiplier: number;
}

export interface RunStats {
  mode: GameMode;
  elapsed: number;
  kills: number;
  eliteKills: number;
  bossKills: number;
  promotions: number;
  maxArmySize: number;
  tierName: string;
  score: number;
  victory: boolean;
}

export interface SaveDataV1 {
  version: number;
  tutorialCompleted: boolean;
  bestScore: number;
  bestEndlessScore: number;
  highestPromotion: number;
  totalKills: number;
  gamesPlayed: number;
  endlessUnlocked: boolean;
  settings: {
    musicEnabled: boolean;
    sfxEnabled: boolean;
    damageNumbers: boolean;
  };
  unlockedCosmetics: string[];
}

export type SaveData = SaveDataV1;
