import type { EnemyArchetype, EnemyArchetypeId } from '../config/enemyStats';
import { archetypesAtThreat } from '../config/enemyStats';
import { COMBAT, WAVES } from '../config/combat';
import { Random } from '../util/Random';
import { clamp } from '../util/math';
import { NEUTRAL_PACING, type SectorPacing } from '../run/SectorGenerator';

export interface WaveMember {
  archetype: EnemyArchetypeId;
  x: number;
  z: number;
  speed: number;
  /** Lebenspunkte als Anteil der Armeestärke — siehe `EnemyManager.arm`. */
  hpShare: number;
  /** Nahkampfschaden pro Sekunde als Anteil der Armeestärke. */
  damageShare: number;
}

export interface WaveSpawn {
  index: number;
  z: number;
  threat: number;
  members: WaveMember[];
}

/**
 * Erzeugt die Wellen.
 *
 * Eine Welle bekommt ihr Lebenspunkte-Budget als ANTEIL der Armeestärke im
 * Moment des Erzeugens (Begründung in `config/combat.ts`). Innerhalb der
 * Welle wird das Budget nach den Zähigkeits-Faktoren der Archetypen verteilt:
 * Ein Tank bekommt achtmal so viel wie ein Walker derselben Welle.
 *
 * Gezogen wird aus dem Run-Seed — eine Runde bleibt reproduzierbar.
 */
export class ZombieSpawner {
  private readonly rng: Random;
  private nextWaveZ = WAVES.firstWaveMeters;
  private nextIndex = 0;

  constructor(
    seed: number,
    /** Bestimmt Dichte und Wucht der Wellen im jeweiligen Sektor. */
    private readonly pacing: SectorPacing = NEUTRAL_PACING,
  ) {
    this.rng = new Random(seed);
  }

  /**
   * Liefert alle Wellen, die jetzt zu erzeugen sind.
   *
   * Die Stärke steht hier bewusst NOCH NICHT fest, nur ihr Verhältnis. Eine
   * Welle entsteht bis zu 200 Meter im Voraus, also zwanzig Sekunden vor der
   * Begegnung — in denen sich die Armee durch Tore vervielfacht. Würde man
   * jetzt festlegen, träfe jede Welle hoffnungslos unterdimensioniert ein.
   * Scharf gemacht wird sie erst in Reichweite (`EnemyManager.arm`).
   *
   * @param distance zurückgelegte Strecke der Armee
   * @param threat   Gefahrenstufe; steuert Menge und Artenvielfalt
   */
  due(distance: number, threat: number): WaveSpawn[] {
    const horizon = distance + WAVES.lookaheadMeters;
    const waves: WaveSpawn[] = [];
    while (this.nextWaveZ <= horizon) {
      waves.push(this.build(this.nextWaveZ, threat));
      this.nextWaveZ +=
        WAVES.spacingMeters * this.pacing.waveSpacingScaleAt(this.nextWaveZ);
    }
    return waves;
  }

  reset(): void {
    this.nextWaveZ = WAVES.firstWaveMeters;
    this.nextIndex = 0;
  }

  private build(z: number, threat: number): WaveSpawn {
    const intensity = Math.min(
      WAVES.intensityMax,
      (WAVES.intensityStart + threat * WAVES.intensityPerThreat) *
        this.pacing.waveIntensityScaleAt(z),
    );
    const count = Math.round(
      clamp(WAVES.countStart + threat * WAVES.countPerThreat, 1, WAVES.countMax),
    );

    const pool = archetypesAtThreat(threat);
    const picked: EnemyArchetype[] = [];
    for (let i = 0; i < count; i += 1) {
      picked.push(this.rng.weighted(pool, (entry) => entry.weight));
    }

    const hpTotal = picked.reduce((sum, entry) => sum + entry.hpFactor, 0);
    const damageTotal = picked.reduce((sum, entry) => sum + entry.damageFactor, 0);

    const members = picked.map<WaveMember>((entry) => ({
      archetype: entry.id,
      x: this.rng.range(-WAVES.spreadHalfWidth, WAVES.spreadHalfWidth),
      z: z + this.rng.range(0, WAVES.depthMeters),
      speed: entry.speed,
      // Anteile, keine Absolutwerte: die ganze Welle trägt zusammen
      // `intensity` mal die Armeestärke an Lebenspunkten.
      hpShare: (intensity * entry.hpFactor) / hpTotal,
      damageShare: (COMBAT.contactDpsFraction * entry.damageFactor) / damageTotal,
    }));

    return { index: this.nextIndex++, z, threat, members };
  }
}
