import type { EnemyKind, Rarity, UpgradeDefinition, UpgradeFamily } from '../types/game';

/**
 * Central, typed event bus.
 *
 * Systems never call into each other directly; they publish facts here.
 * This keeps ArmySystem / CombatSystem / UI mutually independent and makes the
 * whole battle simulation testable without a scene.
 */
export const GameEvent = {
  ENEMY_KILLED: 'ENEMY_KILLED',
  ENEMY_DAMAGED: 'ENEMY_DAMAGED',
  SOLDIER_ADDED: 'SOLDIER_ADDED',
  SOLDIER_DIED: 'SOLDIER_DIED',
  ARMY_CHANGED: 'ARMY_CHANGED',
  REINFORCEMENT_GAINED: 'REINFORCEMENT_GAINED',
  SUPPLY_DROP_COLLECTED: 'SUPPLY_DROP_COLLECTED',
  PROMOTION_READY: 'PROMOTION_READY',
  PROMOTION_SELECTED: 'PROMOTION_SELECTED',
  PROMOTION_COMPLETE: 'PROMOTION_COMPLETE',
  DOCTRINE_UNLOCKED: 'DOCTRINE_UNLOCKED',
  BOSS_SPAWNED: 'BOSS_SPAWNED',
  BOSS_KILLED: 'BOSS_KILLED',
  PHASE_CHANGED: 'PHASE_CHANGED',
  ENDLESS_MODIFIER: 'ENDLESS_MODIFIER',
  TUTORIAL_HINT: 'TUTORIAL_HINT',
  EXPLOSION: 'EXPLOSION',
  GAME_OVER: 'GAME_OVER',
  VICTORY: 'VICTORY',
} as const;

export type GameEventName = (typeof GameEvent)[keyof typeof GameEvent];

export interface GameEventPayloads {
  [GameEvent.ENEMY_KILLED]: {
    kind: EnemyKind;
    elite: boolean;
    boss: boolean;
    x: number;
    y: number;
    points: number;
    score: number;
    byExplosion: boolean;
    byCrit: boolean;
  };
  [GameEvent.ENEMY_DAMAGED]: { x: number; y: number; amount: number; crit: boolean };
  [GameEvent.SOLDIER_ADDED]: { count: number; total: number };
  [GameEvent.SOLDIER_DIED]: { x: number; y: number; remaining: number };
  [GameEvent.ARMY_CHANGED]: { count: number; tierIndex: number };
  [GameEvent.REINFORCEMENT_GAINED]: { progress: number; threshold: number };
  [GameEvent.SUPPLY_DROP_COLLECTED]: { label: string; soldiers: number };
  [GameEvent.PROMOTION_READY]: { promotionIndex: number };
  [GameEvent.PROMOTION_SELECTED]: { upgrade: UpgradeDefinition; rarity: Rarity };
  [GameEvent.PROMOTION_COMPLETE]: { tierName: string; count: number };
  [GameEvent.DOCTRINE_UNLOCKED]: { family: UpgradeFamily; name: string; level: number };
  [GameEvent.BOSS_SPAWNED]: { name: string };
  [GameEvent.BOSS_KILLED]: { name: string };
  [GameEvent.PHASE_CHANGED]: { label: string };
  [GameEvent.ENDLESS_MODIFIER]: { label: string };
  [GameEvent.TUTORIAL_HINT]: { text: string; duration: number };
  [GameEvent.EXPLOSION]: { x: number; y: number; radius: number };
  [GameEvent.GAME_OVER]: Record<string, never>;
  [GameEvent.VICTORY]: Record<string, never>;
}

type Handler<K extends GameEventName> = (payload: GameEventPayloads[K]) => void;

export class EventBus {
  private readonly handlers = new Map<string, Set<(payload: unknown) => void>>();

  on<K extends GameEventName>(event: K, handler: Handler<K>): () => void {
    let set = this.handlers.get(event);
    if (!set) {
      set = new Set();
      this.handlers.set(event, set);
    }
    set.add(handler as (payload: unknown) => void);
    return () => this.off(event, handler);
  }

  off<K extends GameEventName>(event: K, handler: Handler<K>): void {
    this.handlers.get(event)?.delete(handler as (payload: unknown) => void);
  }

  emit<K extends GameEventName>(event: K, payload: GameEventPayloads[K]): void {
    const set = this.handlers.get(event);
    if (!set) return;
    for (const handler of set) handler(payload);
  }

  clear(): void {
    this.handlers.clear();
  }
}
