import type { UnitTier } from '../core/Types';
import { DISPLAY_CAPS } from './gameBalance';

/**
 * Einheiten-Tiers. Reine Daten — kein System darf diese Zahlen hartcodieren.
 *
 * ## Warum 10:1 und nicht 100:1
 *
 * Die Spezifikation schlug 100 Militia je Rifleman vor. Das verträgt sich
 * nicht mit einem Renderbudget von 140 Figuren:
 *
 * - Bei 140 Figuren ist die Truppe optisch voll. Ab hier wächst nur noch
 *   die Zahl im HUD, das Bild steht still.
 * - Mit 100:1 käme die Beförderung erst bei 1.200 Einheiten — also 8,6×
 *   später. So lange sieht der Spieler Stillstand und fragt sich zu Recht,
 *   warum nichts passiert.
 * - Befördert man stattdessen sofort bei 140, blieben mit 100:1 ganze
 *   1,4 Soldaten übrig. Das fühlt sich wie eine Bestrafung an.
 *
 * Mit einem Faktor von 10 fällt die Beförderung genau dort, wo die Truppe
 * voll ist, und hinterlässt einen sichtbaren Trupp von 14 Einheiten. Der
 * Aufstieg wird damit vom seltenen Ereignis zum Takt der Runde.
 */

/** Stärkeverhältnis zwischen zwei benachbarten Tiers. */
export const TIER_RATIO = 10;

/**
 * Einheiten des neuen Tiers direkt nach einer Beförderung.
 *
 * Abgeleitet statt gesetzt: die Beförderung soll genau dann fällig sein,
 * wenn das Renderbudget voll ist. Ändert jemand den Deckel, verschiebt sich
 * die Schwelle automatisch mit.
 */
export const PROMOTION_SQUAD_SIZE = DISPLAY_CAPS.alliesHard / TIER_RATIO;

interface TierSpec {
  id: string;
  name: string;
  color: [number, number, number];
  scale: number;
  muzzleIntensity: number;
}

/**
 * Zwölf Stufen.
 *
 * Mit einem Faktor von 10 fällt eine Beförderung etwa alle 35 Sekunden — ein
 * spürbarer Takt statt eines seltenen Ereignisses. Der Preis ist, dass eine
 * lange Runde rund sieben Stufen verbraucht; die restlichen sind das Futter
 * für den Endlosmodus. Ab Phase 4 kosten Gegner Kampfkraft und flachen die
 * Kurve ab — dann ist die Zahl der Stufen erneut zu prüfen.
 */
const SPECS: readonly TierSpec[] = [
  { id: 'militia', name: 'Militia', color: [0.55, 0.62, 0.7], scale: 1, muzzleIntensity: 1 },
  { id: 'riflemen', name: 'Riflemen', color: [0.3, 0.66, 1], scale: 1.06, muzzleIntensity: 1.3 },
  { id: 'veterans', name: 'Veterans', color: [0.2, 0.85, 0.62], scale: 1.12, muzzleIntensity: 1.6 },
  { id: 'special-forces', name: 'Special Forces', color: [0.95, 0.72, 0.22], scale: 1.18, muzzleIntensity: 2 },
  { id: 'exo-troopers', name: 'Heavy Exo Troopers', color: [0.86, 0.32, 0.86], scale: 1.25, muzzleIntensity: 2.4 },
  { id: 'siege-walkers', name: 'Siege Walkers', color: [1, 0.44, 0.24], scale: 1.32, muzzleIntensity: 2.9 },
  { id: 'orbital-marines', name: 'Orbital Marines', color: [0.35, 0.95, 0.95], scale: 1.4, muzzleIntensity: 3.4 },
  { id: 'titan-guard', name: 'Titan Guard', color: [1, 0.92, 0.4], scale: 1.5, muzzleIntensity: 4 },
  { id: 'void-lancers', name: 'Void Lancers', color: [0.62, 0.4, 1], scale: 1.58, muzzleIntensity: 4.6 },
  { id: 'aegis-sentinels', name: 'Aegis Sentinels', color: [0.2, 1, 0.78], scale: 1.66, muzzleIntensity: 5.2 },
  { id: 'ashborne-legion', name: 'Ashborne Legion', color: [1, 0.28, 0.42], scale: 1.74, muzzleIntensity: 5.9 },
  { id: 'eclipse-vanguard', name: 'Eclipse Vanguard', color: [1, 1, 1], scale: 1.85, muzzleIntensity: 6.6 },
];

export const UNIT_TIERS: readonly UnitTier[] = SPECS.map((spec, index) => {
  const powerPerUnit = Math.pow(TIER_RATIO, index);
  return {
    id: spec.id,
    name: spec.name,
    powerPerUnit,
    // Tier 0 ist der Startzustand und hat keine Schwelle.
    promotionThreshold: index === 0 ? 0 : powerPerUnit * PROMOTION_SQUAD_SIZE,
    // Höhere Tiers sind nicht nur zahlreicher wert, sondern pro Einheit
    // auch besser — sonst wäre der Aufstieg reine Buchhaltung.
    damageMultiplier: 1 + index * 0.12,
    fireRateMultiplier: 1 + index * 0.06,
    visual: {
      color: spec.color,
      scale: spec.scale,
      muzzleIntensity: spec.muzzleIntensity,
    },
  };
});

export const MAX_TIER_INDEX = UNIT_TIERS.length - 1;

/** Sicherer Zugriff — `noUncheckedIndexedAccess` macht [] sonst optional. */
export function getTier(index: number): UnitTier {
  const clamped = Math.min(Math.max(Math.floor(index), 0), MAX_TIER_INDEX);
  const tier = UNIT_TIERS[clamped];
  if (!tier) throw new Error(`Unit tier ${index} is not defined`);
  return tier;
}
