import type { ArmyState, UnitTier } from '../core/Types';
import { getTier } from '../config/unitTiers';
import { DISPLAY_CAPS } from '../config/gameBalance';
import { clamp } from '../util/math';

/**
 * Combat Power ↔ Display Count.
 *
 * Der Kern des Armee-Systems (PLAN.md 3.1): `combatPower` ist die einzige
 * Quelle der Wahrheit und immer in Tier-1-Basispunkten angegeben. Alles
 * Sichtbare wird daraus abgeleitet und nie umgekehrt.
 *
 * Reine Funktionen ohne Zustand — dadurch ohne Browser testbar und in jedem
 * System gefahrlos wiederverwendbar.
 */

/** Wie viele Einheiten des Tiers die Power rechnerisch ergibt (mit Nachkomma). */
export function rawUnits(combatPower: number, tier: UnitTier): number {
  return Math.max(0, combatPower) / tier.powerPerUnit;
}

/**
 * Sichtbare Einheiten. Nach oben durch das Renderbudget gedeckelt — die
 * Deckelung verändert die Kampfkraft nicht, nur ihre Darstellung.
 */
export function deriveDisplayCount(combatPower: number, tier: UnitTier): number {
  const units = rawUnits(combatPower, tier);
  if (units < 1) return combatPower > 0 ? 1 : 0;
  return clamp(Math.floor(units), 1, DISPLAY_CAPS.alliesHard);
}

/** Angefangene Einheit als Anteil [0, 1) — speist den Fortschrittsbalken. */
export function deriveOverflow(combatPower: number, tier: UnitTier): number {
  const units = rawUnits(combatPower, tier);
  return units - Math.floor(units);
}

export function createArmyState(combatPower: number, tierIndex = 0): ArmyState {
  const tier = getTier(tierIndex);
  const power = Math.max(0, combatPower);
  return {
    combatPower: power,
    tierIndex,
    displayCount: deriveDisplayCount(power, tier),
    overflowProgress: deriveOverflow(power, tier),
  };
}

/**
 * Setzt die abgeleiteten Felder neu, ohne `combatPower` anzufassen.
 * Nach jeder Änderung an der Power aufzurufen.
 */
export function refreshDerived(state: ArmyState): ArmyState {
  return createArmyState(state.combatPower, state.tierIndex);
}

/** Ist die Armee vernichtet? */
export function isDefeated(state: ArmyState, defeatThreshold: number): boolean {
  return state.combatPower < defeatThreshold;
}
