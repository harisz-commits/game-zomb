import type { ArmyState, UnitTier } from '../core/Types';
import type { GateEffect } from '../config/gates';
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
 * Tatsaechliche Zahl der Einheiten — ohne Deckel.
 *
 * Bei einem Tier-Verhaeltnis von 100:1 sitzt die gezeichnete Truppe lange
 * am Renderbudget fest, bevor die naechste Befoerderung faellig ist. Waere
 * das die einzige Zahl, sähe der Spieler in dieser Strecke Stillstand, wo in
 * Wahrheit das Achtfache zusammenkommt. Diese Zahl zeigt das HUD.
 */
export function deriveUnitCount(combatPower: number, tier: UnitTier): number {
  const units = rawUnits(combatPower, tier);
  if (units < 1) return combatPower > 0 ? 1 : 0;
  return Math.floor(units);
}

/**
 * Gezeichnete Figuren. Nach oben durch das Renderbudget gedeckelt — die
 * Deckelung veraendert weder Kampfkraft noch die angezeigte Truppenstaerke,
 * nur wie viele Koerper auf dem Feld stehen.
 */
export function deriveDisplayCount(combatPower: number, tier: UnitTier): number {
  const units = deriveUnitCount(combatPower, tier);
  if (units === 0) return 0;
  return clamp(units, 1, DISPLAY_CAPS.alliesHard);
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
    unitCount: deriveUnitCount(power, tier),
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

/**
 * Wirkung eines Gate-Effekts auf eine gegebene Stärke.
 *
 * Einzige Stelle, an der diese Rechnung steht — der ArmyManager benutzt sie
 * ebenso wie Balance-Tests und eine spätere Vorschau im HUD. Zwei Kopien
 * derselben Formel wären zwei Gelegenheiten, unterschiedlich zu driften.
 *
 * Additive Tore zählen in Einheiten des AKTUELLEN Tiers: „+10" heißt zehn
 * Soldaten der Sorte, die gerade marschiert. Ohne diese Kopplung wäre ein
 * +10-Tor ab dem zweiten Tier bedeutungslos.
 */
export function powerAfterEffect(
  power: number,
  effect: GateEffect,
  powerPerUnit: number,
  modifiers?: { gateGain: number; gateShield: number },
): number {
  const gain = modifiers?.gateGain ?? 1;
  const shield = modifiers?.gateShield ?? 0;

  let next: number;
  if (effect.kind === 'add') {
    // Nur Zugewinne werden verstärkt; ein negativer Summand bliebe sonst
    // durch eine Wachstumskarte paradoxerweise schlimmer.
    const scaled = effect.value > 0 ? effect.value * gain : effect.value;
    next = power + scaled * powerPerUnit;
  } else if (effect.value >= 1) {
    // Aus "×2" wird bei +50% Ertrag "×2.5": der Zugewinn wächst, nicht der
    // Faktor selbst — sonst würde eine Karte aus ×0.5 eine Verstärkung machen.
    next = power * (1 + (effect.value - 1) * gain);
  } else {
    // Strafe abschwächen: ×0.5 wird bei 40% Schild zu ×0.7.
    next = power * (effect.value + (1 - effect.value) * shield);
  }
  // Ganzzahlig halten: das HUD soll keine Bruchteile von Soldaten zeigen.
  return Math.max(0, Math.floor(next));
}
