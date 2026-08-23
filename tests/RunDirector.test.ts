import { describe, expect, it } from 'vitest';
import { RunDirector } from '../src/run/RunDirector';
import { SECTOR_RULES, SECTOR_TYPES } from '../src/config/sectors';
import { RUN } from '../src/config/gameBalance';
import type { GameMode } from '../src/core/Types';

const MODES: GameMode[] = ['campaign', 'survival', 'endless'];

describe('run director', () => {
  /**
   * Die ersten Sekunden entscheiden, ob jemand weiterspielt. Wer mit einem
   * Kampfsektor beginnt, lernt die Torwahl nie kennen.
   */
  it('always opens with a gate sector', () => {
    for (const mode of MODES) {
      for (let seed = 0; seed < 30; seed += 1) {
        expect(new RunDirector(seed, mode).sector(0).type).toBe(SECTOR_RULES.openingType);
      }
    }
  });

  it('lays sectors out end to end without gaps or overlaps', () => {
    const director = new RunDirector(7, 'survival');
    for (let i = 1; i < 30; i += 1) {
      const previous = director.sector(i - 1);
      expect(director.sector(i).startZ).toBeCloseTo(previous.startZ + previous.length);
    }
  });

  it('answers which sector covers a position, far ahead included', () => {
    const director = new RunDirector(3, 'endless');
    for (let i = 0; i < 25; i += 1) {
      const sector = director.sector(i);
      expect(director.sectorAt(sector.startZ).index).toBe(i);
      expect(director.sectorAt(sector.startZ + sector.length - 0.01).index).toBe(i);
    }
    // Weit voraus: Tore und Wellen fragen bis 200 Meter im Voraus.
    expect(director.sectorAt(5000).index).toBeGreaterThan(10);
  });

  it('puts a boss at every third sector', () => {
    const director = new RunDirector(11, 'endless');
    for (let i = 0; i < 24; i += 1) {
      expect(director.sector(i).hasBoss).toBe((i + 1) % SECTOR_RULES.bossEvery === 0);
    }
  });

  it('never repeats a sector type that forbids it', () => {
    const noRepeat = new Set(
      SECTOR_TYPES.filter((entry) => entry.noRepeat).map((entry) => entry.type),
    );
    for (let seed = 0; seed < 40; seed += 1) {
      const director = new RunDirector(seed, 'endless');
      for (let i = 1; i < 30; i += 1) {
        const previous = director.sector(i - 1).type;
        const current = director.sector(i).type;
        if (noRepeat.has(current)) expect(current).not.toBe(previous);
      }
    }
  });

  it('keeps harder sector types out of the opening', () => {
    for (let seed = 0; seed < 40; seed += 1) {
      const director = new RunDirector(seed, 'endless');
      for (let i = 0; i < 12; i += 1) {
        const type = director.sector(i).type;
        const config = SECTOR_TYPES.find((entry) => entry.type === type)!;
        expect(config.minSectorIndex).toBeLessThanOrEqual(i);
      }
    }
  });

  it('is reproducible from its seed', () => {
    const types = (seed: number): string[] =>
      Array.from({ length: 20 }, (_, i) => new RunDirector(seed, 'survival').sector(i).type);
    expect(types(99)).toEqual(types(99));
    expect(types(99)).not.toEqual(types(100));
  });

  it('offers real variety rather than one type over and over', () => {
    const seen = new Set<string>();
    for (let seed = 0; seed < 10; seed += 1) {
      const director = new RunDirector(seed, 'endless');
      for (let i = 0; i < 20; i += 1) seen.add(director.sector(i).type);
    }
    expect(seen.size).toBeGreaterThanOrEqual(5);
  });
});

describe('run ending', () => {
  /** Eine Runde soll mit einem Gegner enden, nicht mit einer Ziellinie. */
  it('finishes a finite run on a boss sector', () => {
    for (const mode of ['campaign', 'survival'] as GameMode[]) {
      const director = new RunDirector(5, mode);
      const last = director.sector(RUN.sectorsPerRun[mode] - 1);
      expect(last.isFinal).toBe(true);
      expect(last.hasBoss).toBe(true);
      expect(last.type).toBe('boss');
    }
  });

  it('only declares victory when the final boss falls', () => {
    const director = new RunDirector(5, 'survival');
    const finalIndex = RUN.sectorsPerRun.survival - 1;
    expect(director.isVictory(finalIndex, false)).toBe(false);
    expect(director.isVictory(finalIndex - 1, true)).toBe(false);
    expect(director.isVictory(finalIndex, true)).toBe(true);
  });

  it('never ends the endless mode', () => {
    const director = new RunDirector(5, 'endless');
    expect(director.totalSectors).toBe(Number.POSITIVE_INFINITY);
    for (const index of [0, 5, 50, 500]) {
      expect(director.sector(index).isFinal).toBe(false);
      expect(director.isVictory(index, true)).toBe(false);
    }
  });
});

describe('sector pacing', () => {
  /**
   * Die Sektortypen müssen sich messbar unterscheiden — sonst ist die ganze
   * Abwechslung nur ein anderer Name im HUD.
   */
  it('makes gate sectors gate-heavy and combat sectors wave-heavy', () => {
    const gates = SECTOR_TYPES.find((entry) => entry.type === 'gates')!;
    const combat = SECTOR_TYPES.find((entry) => entry.type === 'combat')!;
    expect(gates.gateSpacingScale).toBeLessThan(combat.gateSpacingScale);
    expect(combat.waveSpacingScale).toBeLessThan(gates.waveSpacingScale);
    expect(combat.waveIntensityScale).toBeGreaterThan(gates.waveIntensityScale);
  });

  it('reports the pacing of the sector a position falls into', () => {
    const director = new RunDirector(4, 'endless');
    for (let i = 0; i < 15; i += 1) {
      const sector = director.sector(i);
      const middle = sector.startZ + sector.length / 2;
      expect(director.gateSpacingScaleAt(middle)).toBe(sector.gateSpacingScale);
      expect(director.waveSpacingScaleAt(middle)).toBe(sector.waveSpacingScale);
      expect(director.waveIntensityScaleAt(middle)).toBe(sector.waveIntensityScale);
    }
  });
});
