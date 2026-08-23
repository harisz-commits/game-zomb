import { describe, expect, it } from 'vitest';
import {
  createArmyState,
  deriveDisplayCount,
  deriveOverflow,
  isDefeated,
  rawUnits,
} from '../src/army/CombatPowerSystem';
import { getTier } from '../src/config/unitTiers';
import { DISPLAY_CAPS } from '../src/config/gameBalance';

const MILITIA = getTier(0);
const RIFLEMEN = getTier(1);

describe('combat power derivation', () => {
  it('shows one soldier per power point at tier 1', () => {
    expect(deriveDisplayCount(1, MILITIA)).toBe(1);
    expect(deriveDisplayCount(37, MILITIA)).toBe(37);
  });

  it('shows one rifleman per ten base points', () => {
    expect(rawUnits(237, RIFLEMEN)).toBeCloseTo(23.7);
    expect(deriveDisplayCount(237, RIFLEMEN)).toBe(23);
  });

  it('keeps the remainder as overflow instead of losing it', () => {
    // 237 Basispunkte sind 23 Riflemen und ein Rest von 7 Punkten.
    expect(deriveOverflow(237, RIFLEMEN)).toBeCloseTo(0.7);
  });

  it('never renders more soldiers than the budget allows', () => {
    const state = createArmyState(100_000, 0);
    expect(state.displayCount).toBe(DISPLAY_CAPS.alliesHard);
    // Die Deckelung ist rein visuell — die Kampfkraft bleibt vollständig.
    expect(state.combatPower).toBe(100_000);
  });

  it('shows nothing at zero power and a last soldier just above it', () => {
    expect(deriveDisplayCount(0, MILITIA)).toBe(0);
    expect(deriveDisplayCount(0.4, MILITIA)).toBe(1);
  });

  it('keeps overflow inside [0, 1)', () => {
    for (const power of [0, 1, 99, 100, 101, 12_345, 999_999]) {
      const overflow = deriveOverflow(power, RIFLEMEN);
      expect(overflow).toBeGreaterThanOrEqual(0);
      expect(overflow).toBeLessThan(1);
    }
  });

  it('treats negative power as destroyed rather than inverted', () => {
    const state = createArmyState(-50, 0);
    expect(state.combatPower).toBe(0);
    expect(state.displayCount).toBe(0);
  });

  it('reports defeat below the threshold', () => {
    expect(isDefeated(createArmyState(0), 1)).toBe(true);
    expect(isDefeated(createArmyState(1), 1)).toBe(false);
  });
});
