import type { GameMode } from '../core/Types';
import { RUN } from '../config/gameBalance';
import { Random } from '../util/Random';
import { planSector, type SectorPacing, type SectorPlan } from './SectorGenerator';

/**
 * Der Regisseur einer Runde.
 *
 * Er kennt als Einziger die Abfolge der Sektoren und beantwortet allen
 * anderen Systemen dieselbe Frage: „Was gilt an dieser Stelle der Strecke?"
 * Torabstand, Wellendichte, Bossposition und das Rundenende hängen daran.
 *
 * Sektoren werden erst erzeugt, wenn jemand nach ihnen fragt. Der
 * Endlosmodus hat damit keine Sonderbehandlung — er hört einfach nie auf zu
 * fragen.
 */
export class RunDirector implements SectorPacing {
  private readonly rng: Random;
  private readonly sectors: SectorPlan[] = [];

  constructor(
    seed: number,
    private readonly mode: GameMode,
  ) {
    this.rng = new Random(seed ^ 0x2545f491);
  }

  /** Anzahl Sektoren einer endlichen Runde; `Infinity` im Endlosmodus. */
  get totalSectors(): number {
    return RUN.sectorsPerRun[this.mode];
  }

  /** Der Plan für den Sektor mit diesem Index. */
  sector(index: number): SectorPlan {
    while (this.sectors.length <= index) {
      const next = this.sectors.length;
      const previous = this.sectors[next - 1] ?? null;
      const startZ = previous ? previous.startZ + previous.length : 0;
      this.sectors.push(
        planSector(this.rng, next, startZ, previous?.type ?? null, this.mode),
      );
    }
    return this.sectors[index]!;
  }

  /**
   * Der Sektor an einer Weltposition.
   *
   * Wird auch für Positionen WEIT VORAUS gefragt: Tore und Wellen werden
   * bis zu zweihundert Meter im Voraus gesetzt und müssen wissen, in welchem
   * Abschnitt sie landen — sonst trüge der Boss-Sektor die Tordichte des
   * Abschnitts, in dem die Armee gerade steht.
   */
  sectorAt(z: number): SectorPlan {
    let index = 0;
    // Die Suche läuft vorwärts, weil Sektoren nur nach vorne wachsen.
    for (;;) {
      const sector = this.sector(index);
      if (z < sector.startZ + sector.length) return sector;
      index += 1;
      // Schutz vor einer Endlosschleife bei absurden Eingaben.
      if (index > 100_000) return sector;
    }
  }

  gateSpacingScaleAt(z: number): number {
    return this.sectorAt(z).gateSpacingScale;
  }

  waveSpacingScaleAt(z: number): number {
    return this.sectorAt(z).waveSpacingScale;
  }

  waveIntensityScaleAt(z: number): number {
    return this.sectorAt(z).waveIntensityScale;
  }

  /** Weltposition, an der ein Boss dieses Sektors steht. */
  bossZ(index: number): number {
    const sector = this.sector(index);
    return sector.startZ + sector.length;
  }

  /**
   * Ist die Runde gewonnen?
   *
   * Nur, wenn der Schlussboss liegt — nicht schon beim Überfahren einer
   * Distanzmarke. Sonst könnte man an ihm vorbeilaufen.
   */
  isVictory(sectorIndex: number, bossDefeatedHere: boolean): boolean {
    if (!Number.isFinite(this.totalSectors)) return false;
    return bossDefeatedHere && this.sector(sectorIndex).isFinal;
  }
}
