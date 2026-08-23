import { describe, expect, it } from 'vitest';
import {
  UNIT_TIERS,
  getTier,
  PROMOTION_SQUAD_SIZE,
  TIER_RATIO,
} from '../src/config/unitTiers';
import { ENEMY_ARCHETYPES } from '../src/config/enemyStats';
import { DISPLAY_CAPS, SIMULATION } from '../src/config/gameBalance';
import { threatLevelForSector, upgradeCost } from '../src/config/levelCurves';
import { formatCompact, formatDuration } from '../src/util/format';

describe('unit tiers', () => {
  it('increases power per unit by the configured ratio per tier', () => {
    for (let i = 1; i < UNIT_TIERS.length; i += 1) {
      const previous = UNIT_TIERS[i - 1]!;
      const current = UNIT_TIERS[i]!;
      expect(current.powerPerUnit / previous.powerPerUnit).toBeCloseTo(TIER_RATIO, 6);
    }
  });

  /**
   * Der Kern der Neuabstimmung: die Beförderung muss genau dann fällig sein,
   * wenn das Renderbudget voll ist. Sonst steht die Truppe optisch still,
   * während die Zahl weiterläuft — und der Spieler sieht nichts passieren.
   */
  it('promotes exactly when the crowd fills the render budget', () => {
    for (let i = 1; i < UNIT_TIERS.length; i += 1) {
      const previous = UNIT_TIERS[i - 1]!;
      const capReachedAt = DISPLAY_CAPS.alliesHard * previous.powerPerUnit;
      expect(UNIT_TIERS[i]!.promotionThreshold).toBeCloseTo(capReachedAt, 6);
    }
  });

  it('leaves a visible squad behind after every promotion', () => {
    for (let i = 1; i < UNIT_TIERS.length; i += 1) {
      const tier = UNIT_TIERS[i]!;
      const unitsAfter = tier.promotionThreshold / tier.powerPerUnit;
      expect(unitsAfter).toBeGreaterThanOrEqual(10);
      expect(unitsAfter).toBeLessThanOrEqual(DISPLAY_CAPS.alliesHard);
    }
  });

  it('gets stronger with every tier', () => {
    for (let i = 1; i < UNIT_TIERS.length; i += 1) {
      expect(UNIT_TIERS[i]!.damageMultiplier).toBeGreaterThan(
        UNIT_TIERS[i - 1]!.damageMultiplier,
      );
      expect(UNIT_TIERS[i]!.visual.scale).toBeGreaterThan(UNIT_TIERS[i - 1]!.visual.scale);
    }
  });

  it('sets promotion thresholds to a full squad of the new tier', () => {
    for (let i = 1; i < UNIT_TIERS.length; i += 1) {
      const tier = UNIT_TIERS[i]!;
      expect(tier.promotionThreshold).toBeCloseTo(tier.powerPerUnit * PROMOTION_SQUAD_SIZE, 6);
    }
  });

  it('stays inside the exact-integer range of a double', () => {
    const highest = UNIT_TIERS[UNIT_TIERS.length - 1]!;
    expect(highest.powerPerUnit * PROMOTION_SQUAD_SIZE).toBeLessThan(Number.MAX_SAFE_INTEGER);
  });

  it('clamps out-of-range tier lookups instead of throwing', () => {
    expect(getTier(-5).id).toBe(UNIT_TIERS[0]!.id);
    expect(getTier(999).id).toBe(UNIT_TIERS[UNIT_TIERS.length - 1]!.id);
  });

  it('uses unique tier ids', () => {
    expect(new Set(UNIT_TIERS.map((t) => t.id)).size).toBe(UNIT_TIERS.length);
  });
});

describe('balance config', () => {
  it('keeps display targets below the hard caps', () => {
    expect(DISPLAY_CAPS.alliesTarget).toBeLessThan(DISPLAY_CAPS.alliesHard);
    expect(DISPLAY_CAPS.enemiesTarget).toBeLessThan(DISPLAY_CAPS.enemiesHard);
  });

  it('uses a sane fixed timestep', () => {
    expect(SIMULATION.tickHz).toBeGreaterThanOrEqual(30);
    expect(SIMULATION.maxTicksPerFrame).toBeGreaterThanOrEqual(1);
  });

  it('gives every enemy archetype positive stats', () => {
    for (const enemy of ENEMY_ARCHETYPES) {
      expect(enemy.hpFactor).toBeGreaterThan(0);
      expect(enemy.damageFactor).toBeGreaterThan(0);
      expect(enemy.speed).toBeGreaterThan(0);
      expect(enemy.weight).toBeGreaterThan(0);
      expect(enemy.minThreat).toBeGreaterThanOrEqual(0);
    }
  });

  it('uses unique enemy ids', () => {
    expect(new Set(ENEMY_ARCHETYPES.map((e) => e.id)).size).toBe(ENEMY_ARCHETYPES.length);
  });

  /** Der einfachste Gegner muss von Anfang an verfügbar sein. */
  it('has a starter enemy at threat zero', () => {
    expect(ENEMY_ARCHETYPES.some((e) => e.minThreat === 0)).toBe(true);
  });
});

describe('curves', () => {
  it('raises threat monotonically', () => {
    let previous = -1;
    for (let sector = 0; sector < 30; sector += 1) {
      const level = threatLevelForSector(sector);
      expect(level).toBeGreaterThan(previous);
      previous = level;
    }
  });

  it('accelerates threat past the exponential knee', () => {
    const early = threatLevelForSector(6) - threatLevelForSector(5);
    const late = threatLevelForSector(21) - threatLevelForSector(20);
    expect(late).toBeGreaterThan(early * 2);
  });

  it('raises upgrade costs with every level', () => {
    for (let level = 0; level < 20; level += 1) {
      expect(upgradeCost(level + 1)).toBeGreaterThan(upgradeCost(level));
    }
  });
});

describe('formatting', () => {
  it('formats compact numbers', () => {
    expect(formatCompact(0)).toBe('0');
    expect(formatCompact(999)).toBe('999');
    expect(formatCompact(1200)).toBe('1.20K');
    expect(formatCompact(34_500_000)).toBe('34.5M');
    expect(formatCompact(-2500)).toBe('-2.50K');
  });

  it('formats durations', () => {
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(65)).toBe('1:05');
    expect(formatDuration(-3)).toBe('0:00');
  });
});
