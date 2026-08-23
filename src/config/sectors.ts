import type { SectorType } from '../core/Types';

/**
 * Sektortypen — die Dramaturgie einer Runde.
 *
 * Ohne sie ist jeder Abschnitt derselbe: dieselbe Mischung aus Toren und
 * Wellen, alle 220 Meter aufs Neue. Eine Runde von vier Minuten braucht
 * Wechsel, sonst ist sie nach dreißig Sekunden erzählt.
 *
 * Jeder Typ verschiebt dieselben drei Regler in eine andere Richtung: wie
 * dicht die Tore stehen, wie oft Wellen kommen und wie schwer sie wiegen.
 * Neue Typen brauchen deshalb keinen neuen Code, nur eine neue Zeile.
 */

export interface SectorTypeConfig {
  type: SectorType;
  /** Kurzname fürs HUD. */
  label: string;
  /** Grundgewicht in der Zufallsauswahl. */
  weight: number;
  /** Nicht vor diesem Sektorindex. */
  minSectorIndex: number;
  /** Nie zweimal direkt hintereinander. */
  noRepeat: boolean;
  lengthMeters: number;
  /** Faktor auf den Torabstand — kleiner heißt mehr Tore. */
  gateSpacingScale: number;
  /** Faktor auf den Wellenabstand — kleiner heißt mehr Wellen. */
  waveSpacingScale: number;
  /** Faktor auf die Wellenstärke. */
  waveIntensityScale: number;
}

export const SECTOR_TYPES: readonly SectorTypeConfig[] = [
  {
    type: 'gates',
    label: 'Supply Line',
    weight: 100,
    minSectorIndex: 0,
    noRepeat: true,
    lengthMeters: 200,
    // Dichte Torfolge, kaum Widerstand: der Abschnitt zum Wachsen.
    gateSpacingScale: 0.68,
    waveSpacingScale: 1.6,
    waveIntensityScale: 0.55,
  },
  {
    type: 'combat',
    label: 'Overrun',
    weight: 95,
    minSectorIndex: 1,
    noRepeat: false,
    lengthMeters: 230,
    // Umgekehrt: kaum Tore, dafür Welle auf Welle.
    gateSpacingScale: 1.5,
    waveSpacingScale: 0.78,
    waveIntensityScale: 1,
  },
  {
    type: 'hazard',
    label: 'Ruins',
    weight: 55,
    minSectorIndex: 2,
    noRepeat: true,
    lengthMeters: 190,
    gateSpacingScale: 1.15,
    waveSpacingScale: 1.1,
    waveIntensityScale: 0.85,
  },
  {
    type: 'elite',
    label: 'Elite Hunt',
    weight: 45,
    minSectorIndex: 3,
    noRepeat: true,
    lengthMeters: 180,
    // Wenige, aber schwere Begegnungen.
    gateSpacingScale: 1.3,
    waveSpacingScale: 1.45,
    waveIntensityScale: 1.55,
  },
  {
    type: 'holdout',
    label: 'Last Stand',
    weight: 30,
    minSectorIndex: 5,
    noRepeat: true,
    lengthMeters: 140,
    gateSpacingScale: 2.2,
    waveSpacingScale: 0.62,
    waveIntensityScale: 1.1,
  },
  {
    type: 'boss',
    label: 'Boss',
    // Nie zufällig gezogen — der Director setzt ihn nach Plan.
    weight: 0,
    minSectorIndex: 0,
    noRepeat: true,
    lengthMeters: 170,
    gateSpacingScale: 1.4,
    waveSpacingScale: 1.5,
    waveIntensityScale: 0.7,
  },
];

export function sectorTypeConfig(type: SectorType): SectorTypeConfig {
  const found = SECTOR_TYPES.find((entry) => entry.type === type);
  if (!found) throw new Error(`Unknown sector type: ${type}`);
  return found;
}

export const SECTOR_RULES = {
  /** Jeder n-te Sektor ist ein Bosssektor. */
  bossEvery: 3,
  /**
   * Der erste Sektor ist immer ein Tor-Sektor.
   *
   * Die ersten Sekunden entscheiden, ob jemand weiterspielt. Wer mit
   * „Overrun" beginnt, lernt die Torwahl nie kennen.
   */
  openingType: 'gates' as SectorType,
} as const;
