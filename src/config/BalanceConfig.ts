/**
 * Central balancing table. No gameplay magic numbers anywhere else.
 *
 * Everything here is plain data so it can be tweaked (or swapped for a
 * different difficulty preset) without touching a single system.
 */

export const BALANCE = {
  // ---------------------------------------------------------------- army ---
  STARTING_SOLDIERS: 10,
  /** Army size that triggers a promotion. */
  PROMOTION_THRESHOLD: 140,
  /** Never let `Early Promotion` style upgrades push it below this. */
  MIN_PROMOTION_THRESHOLD: 90,

  BASE_HP: 100,
  BASE_DAMAGE: 10,
  BASE_FIRE_RATE: 1.2,
  BASE_CRIT_CHANCE: 0.05,
  BASE_CRIT_MULTIPLIER: 2,
  BASE_PIERCE: 0,
  /**
   * Vertical reach of a soldier's hitscan shot, in world units.
   *
   * This is the main lever on how the battlefield *reads*. At 800 the army
   * engaged over most of the approach lane and killed enemies almost the
   * instant they were in range (~1.4s average lifetime), so only 15-27 were
   * ever on screen. A shorter reach lets the horde build up in the upper half
   * of the field before it enters the kill zone, and lets more of it reach the
   * line - density and threat, without spawning more entities.
   */
  BASE_RANGE: 520,

  /** Formation follows the pointer with this smoothing (per second). */
  FORMATION_LERP: 9,
  /** Individual soldiers ease into their formation slot at this rate. */
  SOLDIER_LERP: 12,
  KEYBOARD_SPEED: 620,

  FORMATION_COL_SPACING: 30,
  FORMATION_ROW_SPACING: 20,
  /** Cap on formation width as a fraction of the field. */
  FORMATION_MAX_WIDTH_RATIO: 0.82,

  // ------------------------------------------------------- reinforcements ---
  /**
   * Points needed for +1 soldier at tier power 1.
   *
   * Tuned from full headless campaign runs against the corrected enemy supply
   * (see the spawn-budget fix in EnemySpawnSystem): army growth is
   * supply-limited, so this is effectively "kills per extra soldier".
   */
  REINFORCEMENT_THRESHOLD_BASE: 2.4,
  /**
   * Threshold scales with tier power^exponent. Must be > 1 so each promotion
   * takes longer than the last: army DPS scales linearly with tier power, so
   * an exponent of exactly 1 would keep the interval flat forever and the
   * original 0.72 made every tier arrive *faster* than the one before.
   */
  REINFORCEMENT_TIER_EXPONENT: 1.1,
  /** Maximum reinforcements resolved per frame (avoids spawn spikes). */
  MAX_REINFORCEMENTS_PER_TICK: 6,

  // ------------------------------------------------------------- lanes ---
  /** Seconds before the first supply block enters the lane. */
  SUPPLY_FIRST_AT: 2,
  /** Vertical gap between blocks in the stack. */
  LANE_BLOCK_GAP: 10,
  LANE_BIG_BLOCK_HEIGHT: 150,
  LANE_FILLER_BLOCK_HEIGHT: 78,
  LANE_BLOCK_WIDTH_RATIO: 0.88,
  /** Filler blocks appended behind each weapon block. */
  LANE_FILLER_COUNT: [3, 6] as [number, number],
  LANE_FILLER_HP: 1,
  LANE_FILLER_SOLDIERS: 1,

  /**
   * The stack does NOT drift. Its front block parks this far above the firing
   * line and waits indefinitely; the stack only advances when you break one.
   * The pressure to leave the lane comes from the horde, not from a timer.
   */
  LANE_STACK_FRONT_OFFSET: 210,
  /** Blocks slide into their new slot at this rate after one is broken. */
  LANE_STACK_SLIDE: 9,
  /** Keep at least this many blocks queued up. */
  LANE_STACK_MIN: 9,

  LANE_BLOCK_BASE_HP: 90,
  LANE_BLOCK_TIME_SCALING: 0.014,
  /** Share of one second of full army DPS a weapon block should cost. */
  LANE_BLOCK_DPS_SECONDS: 1.15,
  /**
   * What is frozen inside a big block. Weighted toward weapons - the "+1"
   * filler blocks are what hand out single soldiers.
   */
  LANE_REWARDS: [
    { id: 'DMG', weight: 30, kind: 'DAMAGE', percent: 10 },
    { id: 'ROF', weight: 26, kind: 'FIRE_RATE', percent: 8 },
    { id: 'DMG_BIG', weight: 12, kind: 'DAMAGE', percent: 18 },
    { id: 'ROF_BIG', weight: 10, kind: 'FIRE_RATE', percent: 14 },
    { id: 'S10', weight: 14, kind: 'SOLDIERS', amount: 10 },
    { id: 'X2', weight: 8, kind: 'DOUBLE_POINTS', seconds: 10 },
  ],

  /**
   * Penalty barriers in the combat lane. The number on the barrier IS the
   * penalty; shooting it counts that number down toward zero, so partial
   * suppression always pays off. Whatever is left is what it costs you.
   */
  BARRIER_FIRST_AT: 26,
  BARRIER_INTERVAL: [22, 34] as [number, number],
  BARRIER_HEIGHT: 84,
  BARRIER_WIDTH_RATIO: 0.92,
  BARRIER_PENALTY: [8, 20] as [number, number],
  /** Total HP of a barrier, expressed in seconds of full army DPS. */
  BARRIER_DPS_SECONDS: 1.1,
  BARRIER_MIN_HP: 120,

  // -------------------------------------------------------------- combat ---
  /** Soldiers only re-evaluate their target this often (seconds). */
  TARGET_REFRESH: 0.22,
  /** Column buckets used for cheap nearest-enemy lookups. */
  TARGET_BUCKETS: 18,
  /** Ranged/priority enemies get their effective distance reduced by this. */
  PRIORITY_DISTANCE_BONUS: 260,

  KNOCKBACK_FORCE: 46,
  BASE_EXPLOSION_RADIUS: 88,
  BASE_EXPLOSION_DAMAGE_RATIO: 1.35,

  /** Soldier melee-contact rules. */
  ENEMY_CONTACT_PADDING: 12,

  // ------------------------------------------------------------ specials ---
  DOUBLE_TAP_CHANCE: 0.12,
  BULLET_STORM_EVERY: 10,
  BULLET_STORM_SHOTS: 4,
  OVERDRIVE_ZOMBIE_COUNT: 75,
  OVERDRIVE_FIRE_RATE: 0.3,
  RICOCHET_CHANCE: 0.1,
  RICOCHET_RANGE: 190,
  INFINITE_PENETRATION_EVERY: 20,
  RAILGUN_INTERVAL: 6,
  RAILGUN_DAMAGE_MULT: 9,
  EXECUTE_THRESHOLD: 0.15,
  PERFECT_SHOT_EVERY: 15,
  PERFECT_SHOT_MULT: 6,
  KILL_CHAIN_CRIT_ADD: 0.04,
  KILL_CHAIN_MAX: 0.3,
  KILL_CHAIN_DECAY: 0.12,
  GRENADIER_INTERVAL: 8,
  GRENADIER_DAMAGE_MULT: 4.5,
  CHAIN_REACTION_CHANCE: 0.45,
  CHAIN_REACTION_DEPTH: 2,
  NAPALM_DURATION: 3,
  NAPALM_DPS_RATIO: 0.8,
  NAPALM_TICK: 0.25,
  ARTILLERY_INTERVAL: 25,
  ARTILLERY_STRIKES: 3,
  ARTILLERY_DAMAGE_MULT: 8,
  ARTILLERY_RADIUS_MULT: 1.9,
  RECRUITER_EVERY_KILLS: 30,
  BATTLEFIELD_COMMISSION_CHANCE: 0.35,
  ENDLESS_ARMY_INTERVAL: 20,
  COMBAT_MEDIC_REGEN: 3.5,
  EMERGENCY_SHIELD_INTERVAL: 20,
  EMERGENCY_SHIELD_DURATION: 3,
  LAST_STAND_THRESHOLD: 25,
  LAST_STAND_DAMAGE: 0.5,
  LAST_STAND_FIRE_RATE: 0.3,
  GUARDIAN_PROTOCOL_INTERVAL: 30,
  SHOCKWAVE_KNOCKBACK_CHANCE: 0.25,

  // ------------------------------------------------------------ doctrine ---
  DOCTRINE_CARDS_LEVEL_1: 3,
  DOCTRINE_CARDS_LEVEL_2: 6,
  GATLING_HITS_REQUIRED: 20,
  GATLING_DURATION: 3,
  GATLING_FIRE_RATE: 1.6,
  SNIPER_EVERY: 12,
  SNIPER_DAMAGE_MULT: 4,
  FORTRESS_SHIELD_INTERVAL: 18,
  FORTRESS_SHIELD_DURATION: 3,

  // ------------------------------------------------------------- enemies ---
  /** Global HP scaling: hp * (1 + t/HP_SCALING_TIME) ^ HP_SCALING_POWER. */
  ZOMBIE_HP_SCALING_TIME: 62,
  ZOMBIE_HP_SCALING_POWER: 1.16,
  ZOMBIE_SPEED_SCALING: 0.055,
  ZOMBIE_SPEED_SCALING_CAP: 0.55,
  ELITE_HP_MULT: 3.4,
  ELITE_DAMAGE_MULT: 1.7,
  ELITE_SCALE: 1.28,
  ELITE_POINTS: 8,
  ELITE_SCORE: 50,
  SWARM_PACK_SIZE: [4, 7] as [number, number],
  SPIT_SPEED: 300,
  SPIT_DAMAGE_RATIO: 1,

  // ------------------------------------------------------------ director ---
  /**
   * Base spawn budget (enemy "cost units" per second) at t = 0.
   *
   * The horde is confined to the combat lane (~58% of the field), so this runs
   * hotter than a full-width battlefield would need in order to keep the lane
   * looking packed.
   */
  BASE_SPAWN_RATE: 2.1,
  /** Spawn budget grows linearly with this factor per second. */
  DIFFICULTY_SCALING: 0.021,
  /** Extra difficulty from a strong build - deliberately gentle. */
  POWER_SCALING: 0.16,
  POWER_SCALING_CAP: 0.85,
  SPAWN_RATE_CAP: 13,
  MAX_ZOMBIES: 150,
  /** Hard cap on simultaneous spawns in one director tick. */
  SPAWN_BURST_CAP: 8,

  // ----------------------------------------------------------------- run ---
  RUN_DURATION: 300,
  ENDLESS_BOSS_INTERVAL: 135,
  ENDLESS_MODIFIER_INTERVAL: [30, 60] as [number, number],

  // --------------------------------------------------------------- score ---
  SCORE_PER_KILL: 1,
  SCORE_PER_SECOND: 2,
  SCORE_PER_PROMOTION: 250,
  SCORE_PER_ELITE: 50,
  SCORE_PER_BOSS: 500,

  // --------------------------------------------------------------- rarity ---
  RARITY_TABLE: [
    { untilPromotion: 2, weights: { COMMON: 55, RARE: 35, EPIC: 9, LEGENDARY: 1 } },
    { untilPromotion: 4, weights: { COMMON: 35, RARE: 40, EPIC: 20, LEGENDARY: 5 } },
    { untilPromotion: Infinity, weights: { COMMON: 20, RARE: 35, EPIC: 35, LEGENDARY: 10 } },
  ],
  /** Every Nth promotion guarantees at least one Epic (or better). */
  PITY_EPIC_EVERY: 5,
  /** Every Nth promotion guarantees at least one Legendary. */
  PITY_LEGENDARY_EVERY: 10,
  UPGRADE_CHOICES: 3,

  // -------------------------------------------------------------- feeling ---
  PROMOTION_FREEZE_TIME: 0.45,
  PROMOTION_SLOWMO: 0.12,
  GAME_OVER_SLOWMO_TIME: 1.1,
  DAMAGE_NUMBER_LIFETIME: 0.7,
} as const;

export type BalanceConfig = typeof BALANCE;
