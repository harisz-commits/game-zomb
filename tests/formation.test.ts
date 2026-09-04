import { describe, expect, it } from 'vitest';
import { clamp, damp, distributeRows, formatCompact, formatTime, lerp } from '../src/utils/MathUtils';

describe('distributeRows', () => {
  it('produces the 3 / 4 / 3 wedge for a 10 soldier squad', () => {
    // 10 soldiers over 3 rows: leftovers go to the middle row first.
    expect(distributeRows(10, 3)).toEqual([3, 4, 3]);
  });

  it('always sums to the requested count', () => {
    for (let count = 1; count <= 200; count++) {
      for (let rows = 1; rows <= 12; rows++) {
        const distribution = distributeRows(count, rows);
        expect(distribution.reduce((a, b) => a + b, 0)).toBe(count);
      }
    }
  });

  it('keeps rows within one unit of each other', () => {
    const distribution = distributeRows(140, 10);
    expect(Math.max(...distribution) - Math.min(...distribution)).toBeLessThanOrEqual(1);
  });

  it('handles degenerate input', () => {
    expect(distributeRows(0, 3)).toEqual([]);
    expect(distributeRows(5, 0)).toEqual([]);
  });
});

describe('math helpers', () => {
  it('clamps', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-5, 0, 10)).toBe(0);
    expect(clamp(50, 0, 10)).toBe(10);
  });

  it('lerps', () => {
    expect(lerp(0, 10, 0.5)).toBe(5);
  });

  it('damps toward the target without overshooting', () => {
    let value = 0;
    for (let i = 0; i < 200; i++) value = damp(value, 100, 9, 1 / 60);
    expect(value).toBeGreaterThan(99.9);
    expect(value).toBeLessThanOrEqual(100);
  });

  it('is frame-rate independent within a small tolerance', () => {
    let a = 0;
    for (let i = 0; i < 60; i++) a = damp(a, 100, 9, 1 / 60);
    let b = 0;
    for (let i = 0; i < 30; i++) b = damp(b, 100, 9, 1 / 30);
    expect(Math.abs(a - b)).toBeLessThan(0.001);
  });

  it('formats compact numbers', () => {
    expect(formatCompact(999)).toBe('999');
    expect(formatCompact(1500)).toBe('1.5K');
    expect(formatCompact(25000)).toBe('25K');
    expect(formatCompact(1_250_000)).toBe('1.25M');
  });

  it('formats times', () => {
    expect(formatTime(0)).toBe('0:00');
    expect(formatTime(65)).toBe('1:05');
    expect(formatTime(-5)).toBe('0:00');
  });
});
