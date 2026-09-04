import { describe, expect, it } from 'vitest';
import { SeededRandom } from '../src/utils/SeededRandom';

describe('SeededRandom', () => {
  it('reproduces the exact same sequence for the same seed', () => {
    const a = new SeededRandom(20260824);
    const b = new SeededRandom(20260824);
    const seqA = Array.from({ length: 200 }, () => a.next());
    const seqB = Array.from({ length: 200 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it('produces different sequences for different seeds', () => {
    const a = new SeededRandom(1);
    const b = new SeededRandom(2);
    const seqA = Array.from({ length: 50 }, () => a.next());
    const seqB = Array.from({ length: 50 }, () => b.next());
    expect(seqA).not.toEqual(seqB);
  });

  it('stays inside [0, 1)', () => {
    const rng = new SeededRandom(7);
    for (let i = 0; i < 5000; i++) {
      const value = rng.next();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('respects int bounds inclusively', () => {
    const rng = new SeededRandom(9);
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) {
      const value = rng.int(3, 6);
      expect(value).toBeGreaterThanOrEqual(3);
      expect(value).toBeLessThanOrEqual(6);
      seen.add(value);
    }
    expect(seen.size).toBe(4);
  });

  it('honours weights, including zero-weight entries', () => {
    const rng = new SeededRandom(11);
    const items = [
      { id: 'never', weight: 0 },
      { id: 'rare', weight: 1 },
      { id: 'common', weight: 99 },
    ];
    const counts: Record<string, number> = { never: 0, rare: 0, common: 0 };
    for (let i = 0; i < 4000; i++) {
      const picked = rng.weighted(items, (item) => item.weight);
      counts[picked!.id]++;
    }
    expect(counts.never).toBe(0);
    expect(counts.common).toBeGreaterThan(counts.rare * 5);
  });

  it('returns null when nothing can be picked', () => {
    const rng = new SeededRandom(1);
    expect(rng.weighted([], () => 1)).toBeNull();
    expect(rng.weighted([{ w: 0 }], (i) => i.w)).toBeNull();
  });

  it('shuffles deterministically for a given seed', () => {
    const input = () => [1, 2, 3, 4, 5, 6, 7, 8];
    const a = new SeededRandom(555).shuffle(input());
    const b = new SeededRandom(555).shuffle(input());
    expect(a).toEqual(b);
    expect([...a].sort((x, y) => x - y)).toEqual(input());
  });

  it('can snapshot and restore its state', () => {
    const rng = new SeededRandom(31337);
    rng.next();
    const state = rng.getState();
    const expected = Array.from({ length: 10 }, () => rng.next());

    rng.setState(state);
    expect(Array.from({ length: 10 }, () => rng.next())).toEqual(expected);
  });
});
