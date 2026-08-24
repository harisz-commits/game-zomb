import { describe, expect, it } from 'vitest';
import { RunDirector } from '../src/run/RunDirector';
import { ENDLESS, endlessThreatForSector, threatLevelForSector } from '../src/config/levelCurves';
import { bankRunResult } from '../src/progression/RewardSystem';
import { createDefaultSave } from '../src/save/SaveSchema';
import type { RunResult } from '../src/core/Types';

function endlessResult(sectors: number): RunResult {
  return {
    mode: 'endless',
    victory: false,
    score: 1000,
    stats: {
      sectorsCleared: sectors,
      kills: 100,
      bossesKilled: 1,
      peakTierIndex: 3,
      peakCombatPower: 10_000,
      coinsEarned: 0,
      durationSeconds: 200,
    },
  };
}

describe('endless threat curve', () => {
  it('rises without ever levelling off', () => {
    let previous = -1;
    for (let sector = 0; sector < 60; sector += 1) {
      const threat = endlessThreatForSector(sector);
      expect(threat).toBeGreaterThan(previous);
      previous = threat;
    }
  });

  /**
   * Wer den Endlosmodus freischaltet, hat den Feldzug schon gewonnen. Der
   * Einstieg darf deshalb milder sein — die Kurve holt später umso mehr auf.
   */
  it('starts gentler than a regular run but overtakes it', () => {
    expect(endlessThreatForSector(2)).toBeLessThan(threatLevelForSector(2) + 1);
    expect(endlessThreatForSector(20)).toBeGreaterThan(threatLevelForSector(20));
  });

  it('accelerates rather than growing evenly', () => {
    const early = endlessThreatForSector(6) - endlessThreatForSector(5);
    const late = endlessThreatForSector(26) - endlessThreatForSector(25);
    expect(late).toBeGreaterThan(early * 2);
  });
});

describe('director in endless mode', () => {
  it('uses the endless curve only in endless mode', () => {
    const endless = new RunDirector(1, 'endless');
    const survival = new RunDirector(1, 'survival');
    expect(endless.threatAt(20)).toBeCloseTo(endlessThreatForSector(20));
    expect(survival.threatAt(20)).toBeCloseTo(threatLevelForSector(20));
  });

  it('announces a new threat level at a steady cadence', () => {
    const director = new RunDirector(1, 'endless');
    const announced: number[] = [];
    for (let sector = 0; sector < 40; sector += 1) {
      const milestone = director.milestoneAt(sector);
      if (milestone !== null) announced.push(sector);
    }
    expect(announced[0]).toBe(ENDLESS.milestoneEvery);
    for (let i = 1; i < announced.length; i += 1) {
      expect(announced[i]! - announced[i - 1]!).toBe(ENDLESS.milestoneEvery);
    }
    // Und der Start ist keiner: „Threat level 0" wäre eine leere Meldung.
    expect(director.milestoneAt(0)).toBeNull();
  });

  it('stays silent about threat levels outside endless', () => {
    const director = new RunDirector(1, 'campaign');
    for (let sector = 0; sector < 40; sector += 1) {
      expect(director.milestoneAt(sector)).toBeNull();
    }
  });
});

describe('endless records', () => {
  it('reports a new depth record exactly once', () => {
    const save = createDefaultSave();
    expect(bankRunResult(save, endlessResult(9)).newBestDepth).toBe(true);
    expect(save.stats.bestEndlessSector).toBe(9);
    // Derselbe Lauf noch einmal ist kein Rekord.
    expect(bankRunResult(save, endlessResult(9)).newBestDepth).toBe(false);
    expect(bankRunResult(save, endlessResult(12)).newBestDepth).toBe(true);
  });

  it('never claims a record for a finite run', () => {
    const save = createDefaultSave();
    const campaign: RunResult = { ...endlessResult(30), mode: 'campaign', victory: true };
    expect(bankRunResult(save, campaign).newBestDepth).toBe(false);
    expect(save.stats.bestEndlessSector).toBe(0);
  });
});
