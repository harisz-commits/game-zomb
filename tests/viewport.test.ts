import { describe, expect, it } from 'vitest';
import { Viewport } from '../src/core/Viewport';
import { ARMY_BASE_Y, FIELD_H, FIELD_W, MIN_DEPTH_SCALE } from '../src/config/GameConfig';

/** A portrait viewport at the design aspect ratio. */
function portrait(): Viewport {
  const viewport = new Viewport();
  viewport.update(FIELD_W, FIELD_H);
  return viewport;
}

describe('Viewport perspective', () => {
  it('draws the army line at native scale', () => {
    // Everything else is expressed relative to this row, so a drift here would
    // silently rescale the whole game.
    expect(portrait().depthScale(ARMY_BASE_Y)).toBeCloseTo(1, 6);
  });

  it('shrinks with distance and grows toward the camera', () => {
    const v = portrait();
    expect(v.depthScale(ARMY_BASE_Y - 400)).toBeLessThan(1);
    expect(v.depthScale(ARMY_BASE_Y + 200)).toBeGreaterThan(1);
  });

  it('never shrinks below the readable floor', () => {
    const v = portrait();
    expect(v.depthScale(-100_000)).toBe(MIN_DEPTH_SCALE);
  });

  it('leaves the vanishing column exactly where it is', () => {
    const v = portrait();
    for (const y of [0, 400, ARMY_BASE_Y, FIELD_H]) {
      expect(v.projectX(v.centerX, y)).toBeCloseTo(v.centerX, 6);
    }
  });

  it('pulls both field edges toward the centre by the same amount', () => {
    const v = portrait();
    const y = 200;
    const left = v.centerX - v.projectX(v.fieldLeft, y);
    const right = v.projectX(v.fieldRight, y) - v.centerX;
    expect(left).toBeCloseTo(right, 6);
    expect(left).toBeLessThan(v.centerX - v.fieldLeft);
  });

  it('keeps a point in the same lane after projection', () => {
    // The whole game is "which lane is the formation pointing at", so the
    // projection must never move something across the divider.
    const v = portrait();
    for (let y = -600; y <= FIELD_H; y += 37) {
      for (let x = v.fieldLeft; x <= v.fieldRight; x += 23) {
        const projected = v.projectX(x, y);
        const dividerAtRow = v.projectX(v.dividerX, y);
        expect(v.isSupplyLane(x)).toBe(projected < dividerAtRow);
      }
    }
  });

  it('round-trips through unprojectX', () => {
    const v = portrait();
    for (const y of [-500, 0, 640, ARMY_BASE_Y, FIELD_H]) {
      for (const x of [10, 360, 700]) {
        expect(v.unprojectX(v.projectX(x, y), y)).toBeCloseTo(x, 6);
      }
    }
  });

  it('hazes the far end of the bridge and leaves the near end clear', () => {
    const v = portrait();
    expect(v.fogAlpha(ARMY_BASE_Y)).toBe(0);
    expect(v.fogAlpha(0)).toBeGreaterThan(0);
    expect(v.fogAlpha(0)).toBeLessThanOrEqual(1);
    // Monotonic: nothing nearer may be hazier than something further away.
    let previous = 0;
    for (let y = ARMY_BASE_Y; y > -400; y -= 25) {
      const fog = v.fogAlpha(y);
      expect(fog).toBeGreaterThanOrEqual(previous);
      previous = fog;
    }
  });

  it('survives an orientation change without leaving the field behind', () => {
    const v = new Viewport();
    v.update(900, 500);
    expect(v.depthScale(ARMY_BASE_Y)).toBeCloseTo(1, 6);
    expect(v.projectX(v.centerX, 0)).toBeCloseTo(v.centerX, 6);
    v.update(360, 800);
    expect(v.depthScale(ARMY_BASE_Y)).toBeCloseTo(1, 6);
    expect(v.fieldLeft).toBeLessThan(v.dividerX);
    expect(v.dividerX).toBeLessThan(v.fieldRight);
  });
});
