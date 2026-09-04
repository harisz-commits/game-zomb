import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/BalanceConfig';
import { getSoldierTier, getTierCount } from '../src/data/soldierTiers';
import { PromotionSystem, convertArmyCount } from '../src/systems/PromotionSystem';
import { createBaseModifierState } from '../src/systems/UpgradeSystem';

describe('promotion math', () => {
  it('converts 140 soldiers into 70 veterans', () => {
    expect(convertArmyCount(140, 1, 2)).toBe(70);
  });

  it('does not lose the surplus (145 -> 73 veterans)', () => {
    expect(convertArmyCount(145, 1, 2)).toBe(73);
  });

  it('converts 140 veterans into 70 elite', () => {
    expect(convertArmyCount(140, 2, 4)).toBe(70);
  });

  it('preserves total combat power within one soldier of rounding', () => {
    for (const count of [1, 7, 99, 140, 145, 163]) {
      for (let tier = 0; tier < 8; tier++) {
        const from = getSoldierTier(tier);
        const to = getSoldierTier(tier + 1);
        const converted = convertArmyCount(count, from.power, to.power);
        const before = count * from.power;
        const after = converted * to.power;
        expect(after).toBeGreaterThanOrEqual(before);
        expect(after - before).toBeLessThan(to.power);
      }
    }
  });

  it('never converts an army to zero', () => {
    expect(convertArmyCount(1, 1, 2)).toBe(1);
    expect(convertArmyCount(3, 1, 32)).toBe(1);
  });
});

describe('PromotionSystem', () => {
  it('walks the full named tier ladder', () => {
    const system = new PromotionSystem();
    expect(system.currentTier.id).toBe('SOLDIER');

    const names: string[] = [];
    let count = 140;
    for (let i = 0; i < 5; i++) {
      const result = system.promote(count);
      names.push(result.toTier.id);
      count = result.toCount;
      // Each promotion roughly halves the roster.
      expect(count).toBe(70);
      count = 140; // refill for the next promotion
    }

    expect(names).toEqual(['VETERAN', 'ELITE', 'COMMANDO', 'SPECIAL_FORCES', 'BLACK_OPS']);
  });

  it('continues into prestige tiers without an upper bound', () => {
    const system = new PromotionSystem();
    for (let i = 0; i < getTierCount() + 3; i++) system.promote(140);

    const tier = system.currentTier;
    expect(tier.prestige).toBeGreaterThan(0);
    expect(tier.name.startsWith('BLACK OPS')).toBe(true);
    expect(tier.power).toBeGreaterThan(getSoldierTier(getTierCount() - 1).power);
  });

  it('is ready exactly at the threshold', () => {
    const system = new PromotionSystem();
    expect(system.isReady(BALANCE.PROMOTION_THRESHOLD - 1)).toBe(false);
    expect(system.isReady(BALANCE.PROMOTION_THRESHOLD)).toBe(true);
  });

  it('applies the Early Promotion threshold modifier', () => {
    const system = new PromotionSystem();
    const mods = createBaseModifierState();
    mods.promotionThresholdDelta = -15;
    expect(system.getThreshold(mods)).toBe(125);
    expect(system.isReady(125, mods)).toBe(true);
  });

  it('clamps the threshold to the configured minimum', () => {
    const system = new PromotionSystem();
    const mods = createBaseModifierState();
    mods.promotionThresholdDelta = -500;
    expect(system.getThreshold(mods)).toBe(BALANCE.MIN_PROMOTION_THRESHOLD);
  });
});
