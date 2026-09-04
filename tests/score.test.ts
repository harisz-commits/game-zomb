import { describe, expect, it } from 'vitest';
import { ScoreSystem, computeScore } from '../src/systems/ScoreSystem';

describe('computeScore', () => {
  it('follows the documented formula', () => {
    // 100 kills + 120s*2 + 3 promotions*250 + 4 elites*50 + 1 boss*500
    const score = computeScore({
      kills: 100,
      elapsedSeconds: 120,
      promotions: 3,
      eliteKills: 4,
      bossKills: 1,
    });
    expect(score).toBe(100 + 240 + 750 + 200 + 500);
  });

  it('is zero for an empty run', () => {
    expect(
      computeScore({ kills: 0, elapsedSeconds: 0, promotions: 0, eliteKills: 0, bossKills: 0 }),
    ).toBe(0);
  });

  it('always returns a non-negative integer', () => {
    const score = computeScore({
      kills: 7,
      elapsedSeconds: 12.9,
      promotions: 0,
      eliteKills: 0,
      bossKills: 0,
    });
    expect(Number.isInteger(score)).toBe(true);
    expect(score).toBeGreaterThanOrEqual(0);
    // Fractional seconds are floored before scaling.
    expect(score).toBe(7 + 24);
  });

  it('never goes negative on nonsense input', () => {
    expect(
      computeScore({
        kills: -100,
        elapsedSeconds: -10,
        promotions: 0,
        eliteKills: 0,
        bossKills: 0,
      }),
    ).toBe(0);
  });

  it('grows monotonically with every tracked stat', () => {
    const base = { kills: 10, elapsedSeconds: 10, promotions: 1, eliteKills: 1, bossKills: 1 };
    const baseScore = computeScore(base);
    expect(computeScore({ ...base, kills: 11 })).toBeGreaterThan(baseScore);
    expect(computeScore({ ...base, elapsedSeconds: 11 })).toBeGreaterThan(baseScore);
    expect(computeScore({ ...base, promotions: 2 })).toBeGreaterThan(baseScore);
    expect(computeScore({ ...base, eliteKills: 2 })).toBeGreaterThan(baseScore);
    expect(computeScore({ ...base, bossKills: 2 })).toBeGreaterThan(baseScore);
  });
});

describe('ScoreSystem', () => {
  it('tracks kills, elites and bosses separately', () => {
    const score = new ScoreSystem();
    score.addKill(false, false);
    score.addKill(true, false);
    score.addKill(false, true);

    expect(score.kills).toBe(3);
    expect(score.eliteKills).toBe(1);
    expect(score.bossKills).toBe(1);
  });

  it('remembers the peak army size', () => {
    const score = new ScoreSystem();
    score.trackArmySize(40);
    score.trackArmySize(140);
    score.trackArmySize(70);
    expect(score.maxArmySize).toBe(140);
  });

  it('resets cleanly for a retry', () => {
    const score = new ScoreSystem();
    score.addKill(true, true);
    score.setElapsed(90);
    score.setPromotions(4);
    score.trackArmySize(120);
    expect(score.score).toBeGreaterThan(0);

    score.reset();
    expect(score.score).toBe(0);
    expect(score.maxArmySize).toBe(0);
  });
});
