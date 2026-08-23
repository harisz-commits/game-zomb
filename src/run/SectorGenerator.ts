import type { GameMode, SectorType } from '../core/Types';
import { SECTOR_RULES, SECTOR_TYPES, sectorTypeConfig } from '../config/sectors';
import { RUN } from '../config/gameBalance';
import type { Random } from '../util/Random';

/**
 * Was Tore und Wellen an einer Weltposition wissen müssen.
 *
 * Bewusst schmal: `GateSystem` und `ZombieSpawner` sollen den RunDirector
 * nicht kennen, nur diese drei Fragen stellen können. Tests reichen dafür
 * eine Attrappe.
 */
export interface SectorPacing {
  gateSpacingScaleAt(z: number): number;
  waveSpacingScaleAt(z: number): number;
  waveIntensityScaleAt(z: number): number;
}

/** Nichts verändert — der Zustand vor dem Director. */
export const NEUTRAL_PACING: SectorPacing = {
  gateSpacingScaleAt: () => 1,
  waveSpacingScaleAt: () => 1,
  waveIntensityScaleAt: () => 1,
};

export interface SectorPlan {
  index: number;
  type: SectorType;
  label: string;
  /** Weltposition, an der der Sektor beginnt. */
  startZ: number;
  length: number;
  gateSpacingScale: number;
  waveSpacingScale: number;
  waveIntensityScale: number;
  /** Wartet am Ende dieses Sektors ein Boss? */
  hasBoss: boolean;
  /** Der letzte Sektor einer endlichen Runde — danach ist gewonnen. */
  isFinal: boolean;
}

/**
 * Baut die Sektorfolge einer Runde.
 *
 * Deterministisch aus dem Run-Seed: Dieselbe Runde ergibt dieselbe Abfolge —
 * Voraussetzung dafür, dass sich eine Balance-Messung überhaupt wiederholen
 * lässt (PLAN.md R7).
 *
 * Zwei Plätze sind fest vergeben und nicht dem Zufall überlassen: Der erste
 * Sektor ist immer ein Tor-Sektor, und jeder dritte endet mit einem Boss.
 * Alles dazwischen wird gewichtet gezogen, ohne denselben Typ zweimal
 * hintereinander.
 */
export function planSector(
  rng: Random,
  index: number,
  startZ: number,
  previous: SectorType | null,
  mode: GameMode,
): SectorPlan {
  const totalSectors = RUN.sectorsPerRun[mode];
  const isFinal = Number.isFinite(totalSectors) && index === totalSectors - 1;
  // Der Schlusssektor ist immer ein Bosskampf: eine Runde soll mit einem
  // Gegner enden, nicht mit einer Ziellinie.
  const hasBoss = isFinal || (index + 1) % SECTOR_RULES.bossEvery === 0;

  const type = pickType(rng, index, previous, hasBoss);
  const config = sectorTypeConfig(type);

  return {
    index,
    type,
    label: config.label,
    startZ,
    length: config.lengthMeters,
    gateSpacingScale: config.gateSpacingScale,
    waveSpacingScale: config.waveSpacingScale,
    waveIntensityScale: config.waveIntensityScale,
    hasBoss,
    isFinal,
  };
}

function pickType(
  rng: Random,
  index: number,
  previous: SectorType | null,
  hasBoss: boolean,
): SectorType {
  if (index === 0) return SECTOR_RULES.openingType;
  if (hasBoss) return 'boss';

  const candidates = SECTOR_TYPES.filter(
    (entry) =>
      entry.weight > 0 &&
      entry.minSectorIndex <= index &&
      !(entry.noRepeat && entry.type === previous),
  );
  if (candidates.length === 0) return 'combat';
  return rng.weighted(candidates, (entry) => entry.weight).type;
}
