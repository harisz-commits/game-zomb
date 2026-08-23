import type { ArmyState } from '../core/Types';
import { MAX_TIER_INDEX, getTier } from '../config/unitTiers';
import { createArmyState } from './CombatPowerSystem';

/**
 * Beförderung in das nächste Einheiten-Tier.
 *
 * Der entscheidende Punkt: `combatPower` bleibt bei einer Beförderung
 * UNVERÄNDERT. Es wird nichts umgerechnet und nichts eingetauscht — nur die
 * Sorte Soldat wechselt, in der dieselbe Stärke dargestellt wird. Dadurch
 * kann Restkraft gar nicht erst verloren gehen: Sie ist immer noch da, sie
 * erscheint nur als angefangene Einheit des neuen Tiers (`overflowProgress`).
 *
 * Beispiel aus der Spezifikation:
 *   237 Militia, Beförderung zu Riflemen (1 Rifleman = 100 Militia)
 *   → combatPower bleibt 237
 *   → sichtbar: 2 Riflemen
 *   → overflowProgress: 0.37  (die „37 übrigen Militia")
 */

export interface PromotionResult {
  state: ArmyState;
  /** Wie viele Stufen aufgestiegen wurde; 0 = keine Beförderung. */
  steps: number;
  fromTierIndex: number;
  toTierIndex: number;
}

/**
 * Reicht die Stärke für den nächsten Tier?
 *
 * @param discount Anteil, um den die Schwelle sinkt (Karte „Field Commission").
 */
export function canPromote(state: ArmyState, discount = 0): boolean {
  const next = state.tierIndex + 1;
  if (next > MAX_TIER_INDEX) return false;
  const threshold = getTier(next).promotionThreshold * (1 - discount);
  return state.combatPower >= threshold;
}

/**
 * Befördert so weit, wie die Stärke reicht.
 *
 * Mehrere Stufen auf einmal sind möglich und beabsichtigt: Wer durch eine
 * Kette von ×3-Toren zwei Schwellen überspringt, soll nicht künstlich
 * ausgebremst werden und auf den nächsten Kontrollpunkt warten müssen.
 */
export function promote(state: ArmyState, discount = 0): PromotionResult {
  let current = state;
  let steps = 0;
  while (canPromote(current, discount)) {
    current = createArmyState(current.combatPower, current.tierIndex + 1);
    steps += 1;
  }
  return {
    state: current,
    steps,
    fromTierIndex: state.tierIndex,
    toTierIndex: current.tierIndex,
  };
}
