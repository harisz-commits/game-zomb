import type { GameMode } from '../types/game';
import type { EventBus } from './EventBus';
import type { Viewport } from './Viewport';
import type { SeededRandom } from '../utils/SeededRandom';
import type { QualityManager } from '../systems/QualityManager';
import type { ArmySystem } from '../systems/ArmySystem';
import type { EnemySystem } from '../systems/EnemySpawnSystem';
import type { EffectsSystem } from '../systems/EffectsSystem';
import type { CombatSystem } from '../systems/CombatSystem';
import type { UpgradeSystem } from '../systems/UpgradeSystem';
import type { PromotionSystem } from '../systems/PromotionSystem';
import type { ScoreSystem } from '../systems/ScoreSystem';
import type { EnemyDirector } from '../systems/EnemyDirector';
import type { LaneObjectSystem } from '../systems/LaneObjectSystem';

/** Mutable per-run state shared by all systems. */
export interface RuntimeState {
  mode: GameMode;
  elapsed: number;
  /** 0 = frozen, 1 = normal. Used for promotion slow-mo and game-over. */
  timeScale: number;
  /** Host (YouTube) pause - the whole simulation stops. */
  paused: boolean;
  /** Promotion modal is open. */
  frozen: boolean;
  over: boolean;
  victory: boolean;
  bossActive: boolean;
  /** Aggregate shots per second, consumed by the audio system. */
  gunfireRate: number;
  totalShots: number;
}

export function createRuntimeState(mode: GameMode): RuntimeState {
  return {
    mode,
    elapsed: 0,
    timeScale: 1,
    paused: false,
    frozen: false,
    over: false,
    victory: false,
    bossActive: false,
    gunfireRate: 0,
    totalShots: 0,
  };
}

/**
 * Dependency container handed to every battle system.
 *
 * BattleScene builds it; systems only talk to each other through this and the
 * event bus, which is what keeps BattleScene an orchestrator instead of a god
 * class.
 */
export interface BattleContext {
  events: EventBus;
  rng: SeededRandom;
  viewport: Viewport;
  quality: QualityManager;
  runtime: RuntimeState;

  army: ArmySystem;
  enemies: EnemySystem;
  laneObjects: LaneObjectSystem;
  effects: EffectsSystem;
  combat: CombatSystem;
  upgrades: UpgradeSystem;
  promotion: PromotionSystem;
  score: ScoreSystem;
  director: EnemyDirector;
}
