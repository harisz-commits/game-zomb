import { describe, expect, it } from 'vitest';
import {
  applyMetaUpgrades,
  buyUpgrade,
  offersFor,
  startingCombatPower,
  upgradeLevel,
  upgradeTotal,
} from '../src/progression/MetaProgression';
import { bankRunResult, computeRewards, computeScore } from '../src/progression/RewardSystem';
import { createDefaultSave } from '../src/save/SaveSchema';
import { META_UPGRADES, metaUpgrade, metaUpgradeCost } from '../src/config/metaUpgrades';
import { RunModifiers } from '../src/run/RunModifiers';
import { ARMY } from '../src/config/gameBalance';
import type { RunResult, RunStats } from '../src/core/Types';

function stats(overrides: Partial<RunStats> = {}): RunStats {
  return {
    sectorsCleared: 5,
    kills: 250,
    bossesKilled: 2,
    peakTierIndex: 4,
    peakCombatPower: 50_000,
    coinsEarned: 0,
    durationSeconds: 130,
    ...overrides,
  };
}

function result(overrides: Partial<RunResult> = {}): RunResult {
  return { mode: 'campaign', victory: true, score: 1000, stats: stats(), ...overrides };
}

describe('upgrade catalogue', () => {
  it('uses unique ids and sane bounds', () => {
    expect(new Set(META_UPGRADES.map((u) => u.id)).size).toBe(META_UPGRADES.length);
    for (const spec of META_UPGRADES) {
      expect(spec.maxLevel).toBeGreaterThan(0);
      expect(spec.baseCost).toBeGreaterThan(0);
      expect(spec.costGrowth).toBeGreaterThan(1);
      expect(spec.perLevel).toBeGreaterThan(0);
    }
  });

  it('raises the price with every level', () => {
    for (const spec of META_UPGRADES) {
      for (let level = 0; level < spec.maxLevel - 1; level += 1) {
        expect(metaUpgradeCost(spec, level + 1)).toBeGreaterThan(metaUpgradeCost(spec, level));
      }
    }
  });

  it('describes what the next level actually gives', () => {
    const save = createDefaultSave();
    for (const offer of offersFor(save)) {
      expect(offer.level).toBe(0);
      expect(offer.nextDescription).toBe(offer.spec.describe(offer.spec.perLevel));
    }
  });
});

describe('buying', () => {
  it('spends the right currency and raises the level', () => {
    const save = createDefaultSave();
    save.meta.coins = 1000;
    save.meta.techParts = 10;

    expect(buyUpgrade(save, 'firepower')).toBe(true);
    expect(upgradeLevel(save, 'firepower')).toBe(1);
    expect(save.meta.coins).toBe(1000 - metaUpgradeCost(metaUpgrade('firepower'), 0));
    expect(save.meta.techParts).toBe(10);

    expect(buyUpgrade(save, 'veterancy')).toBe(true);
    expect(save.meta.techParts).toBeLessThan(10);
  });

  it('refuses a purchase that cannot be paid and changes nothing', () => {
    const save = createDefaultSave();
    const before = JSON.stringify(save);
    expect(buyUpgrade(save, 'firepower')).toBe(false);
    expect(JSON.stringify(save)).toBe(before);
  });

  it('stops at the maximum level', () => {
    const save = createDefaultSave();
    save.meta.coins = 1e9;
    const spec = metaUpgrade('armor');
    for (let i = 0; i < spec.maxLevel; i += 1) expect(buyUpgrade(save, 'armor')).toBe(true);
    expect(buyUpgrade(save, 'armor')).toBe(false);
    expect(upgradeLevel(save, 'armor')).toBe(spec.maxLevel);
  });

  /** Ein manipulierter Spielstand darf nicht über die Obergrenze wirken. */
  it('clamps a level beyond the maximum', () => {
    const save = createDefaultSave();
    save.upgrades['armor'] = 999;
    expect(upgradeLevel(save, 'armor')).toBe(metaUpgrade('armor').maxLevel);
  });
});

describe('upgrades reaching the run', () => {
  it('adds to the starting army in units of the starting tier', () => {
    const save = createDefaultSave();
    expect(startingCombatPower(save)).toBe(ARMY.startCombatPower);
    save.upgrades['start-army'] = 3;
    expect(startingCombatPower(save)).toBe(
      ARMY.startCombatPower + 3 * metaUpgrade('start-army').perLevel,
    );
  });

  it('feeds the same modifiers the checkpoint cards use', () => {
    const save = createDefaultSave();
    save.upgrades['firepower'] = 2;
    save.upgrades['armor'] = 3;
    save.upgrades['gate-bonus'] = 1;

    const mods = new RunModifiers();
    applyMetaUpgrades(save, mods);
    expect(mods.damage).toBeCloseTo(1 + upgradeTotal(save, 'firepower'));
    expect(mods.armor).toBeCloseTo(upgradeTotal(save, 'armor'));
    expect(mods.gateGain).toBeCloseTo(1 + upgradeTotal(save, 'gate-bonus'));
  });

  /**
   * Ein voll ausgebauter Spielstand darf das Spiel nicht abschaffen. Die
   * Obergrenzen der Modifikatoren müssen auch dann greifen, wenn dauerhafte
   * Aufwertungen und Karten aufeinandertreffen.
   */
  it('cannot make the army untouchable, even fully upgraded', () => {
    const save = createDefaultSave();
    for (const spec of META_UPGRADES) save.upgrades[spec.id] = spec.maxLevel;

    const mods = new RunModifiers();
    applyMetaUpgrades(save, mods);
    for (let i = 0; i < 20; i += 1) {
      mods.apply('armor', 0.55);
      mods.apply('gate-shield', 0.9);
    }
    expect(mods.armor).toBeLessThan(1);
    expect(mods.gateShield).toBeLessThan(1);
  });
});

describe('rewards', () => {
  it('pays for sectors, kills and bosses', () => {
    const rewards = computeRewards(stats(), 0);
    expect(rewards.coins).toBeGreaterThan(0);
    expect(rewards.techParts).toBe(2);
    expect(rewards.salvageBonus).toBe(0);
  });

  it('pays more with salvage, and says how much more', () => {
    const plain = computeRewards(stats(), 0);
    const salvaged = computeRewards(stats(), 0.5);
    expect(salvaged.coins).toBeGreaterThan(plain.coins);
    expect(salvaged.salvageBonus).toBe(salvaged.coins - plain.coins);
  });

  it('pays nothing for a run that achieved nothing', () => {
    const empty = computeRewards(
      stats({ sectorsCleared: 0, kills: 0, bossesKilled: 0 }),
      0,
    );
    expect(empty.coins).toBe(0);
    expect(empty.techParts).toBe(0);
  });
});

describe('score', () => {
  it('rewards every kind of progress', () => {
    const base = computeScore(stats(), false, 'campaign');
    expect(computeScore(stats({ sectorsCleared: 6 }), false, 'campaign')).toBeGreaterThan(base);
    expect(computeScore(stats({ kills: 300 }), false, 'campaign')).toBeGreaterThan(base);
    expect(computeScore(stats({ bossesKilled: 3 }), false, 'campaign')).toBeGreaterThan(base);
    expect(computeScore(stats({ peakTierIndex: 5 }), false, 'campaign')).toBeGreaterThan(base);
  });

  it('pays a bonus for finishing the run', () => {
    expect(computeScore(stats(), true, 'campaign')).toBeGreaterThan(computeScore(stats(), false, 'campaign'));
  });

  /**
   * Im Endlosmodus ist Tiefe die einzige Währung: Ohne Aufschlag wäre der
   * zwanzigste Sektor kaum mehr wert als der zehnte.
   */
  it('rewards depth in endless mode', () => {
    const shallow = computeScore(stats({ sectorsCleared: 5 }), false, 'endless');
    const deep = computeScore(stats({ sectorsCleared: 20 }), false, 'endless');
    expect(deep / shallow).toBeGreaterThan(1.5);
    // Und der Aufschlag gilt nur dort.
    expect(computeScore(stats({ sectorsCleared: 20 }), false, 'endless')).toBeGreaterThan(
      computeScore(stats({ sectorsCleared: 20 }), false, 'survival'),
    );
  });

  /**
   * Die Kampfkraft wächst um Zehnerpotenzen. Ginge sie ungedämpft ein,
   * zählten Sektoren, Kills und Bosse gar nicht mehr.
   */
  it('damps combat power so the other factors still matter', () => {
    const modest = computeScore(stats({ peakCombatPower: 1000 }), false, 'campaign');
    const huge = computeScore(stats({ peakCombatPower: 1_000_000_000 }), false, 'campaign');
    expect(huge).toBeGreaterThan(modest);
    // Eine Million Mal mehr Kraft darf nicht eine Million Mal mehr Punkte geben.
    expect(huge / modest).toBeLessThan(5000);
  });
});

describe('banking a run', () => {
  it('credits coins, parts and statistics', () => {
    const save = createDefaultSave();
    const rewards = bankRunResult(save, result());
    expect(save.meta.coins).toBe(rewards.coins);
    expect(save.meta.techParts).toBe(rewards.techParts);
    expect(save.stats.runs).toBe(1);
    expect(save.stats.kills).toBe(250);
  });

  it('keeps the best score, never the latest', () => {
    const save = createDefaultSave();
    bankRunResult(save, result({ score: 5000 }));
    bankRunResult(save, result({ score: 1000 }));
    expect(save.stats.bestScore).toBe(5000);
  });

  it('unlocks endless on the first victory and only once', () => {
    const save = createDefaultSave();
    expect(save.unlocks).not.toContain('endless');
    bankRunResult(save, result({ victory: false }));
    expect(save.unlocks).not.toContain('endless');
    bankRunResult(save, result({ victory: true }));
    bankRunResult(save, result({ victory: true }));
    expect(save.unlocks.filter((entry) => entry === 'endless')).toHaveLength(1);
  });

  it('tracks the deepest endless run separately', () => {
    const save = createDefaultSave();
    bankRunResult(save, result({ mode: 'endless', stats: stats({ sectorsCleared: 12 }) }));
    expect(save.stats.bestEndlessSector).toBe(12);
    bankRunResult(save, result({ mode: 'campaign', stats: stats({ sectorsCleared: 40 }) }));
    expect(save.stats.bestEndlessSector).toBe(12);
  });

  /** Salvage muss sich auf die verbuchte Summe auswirken, nicht nur im Text. */
  it('applies the salvage upgrade to what is actually banked', () => {
    const plain = createDefaultSave();
    const salvaged = createDefaultSave();
    salvaged.upgrades['salvage'] = metaUpgrade('salvage').maxLevel;
    bankRunResult(plain, result());
    bankRunResult(salvaged, result());
    expect(salvaged.meta.coins).toBeGreaterThan(plain.meta.coins);
  });
});
