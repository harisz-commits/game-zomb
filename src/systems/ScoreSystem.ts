import { BALANCE } from '../config/BalanceConfig';

export interface ScoreInput {
  kills: number;
  elapsedSeconds: number;
  promotions: number;
  eliteKills: number;
  bossKills: number;
}

/**
 * The single, primary score. There is deliberately only one score type - it is
 * the one value reported to `ytgame.engagement.sendScore`.
 *
 *   score = kills
 *         + elapsedSeconds * 2
 *         + promotions     * 250
 *         + eliteKills     * 50
 *         + bossKills      * 500
 */
export function computeScore(input: ScoreInput): number {
  const raw =
    input.kills * BALANCE.SCORE_PER_KILL +
    Math.floor(input.elapsedSeconds) * BALANCE.SCORE_PER_SECOND +
    input.promotions * BALANCE.SCORE_PER_PROMOTION +
    input.eliteKills * BALANCE.SCORE_PER_ELITE +
    input.bossKills * BALANCE.SCORE_PER_BOSS;

  // Score must stay a non-negative integer for the Playables leaderboard.
  return Math.max(0, Math.floor(raw));
}

/** Live score tracking during a run. */
export class ScoreSystem {
  kills = 0;
  eliteKills = 0;
  bossKills = 0;
  elapsed = 0;
  promotions = 0;
  maxArmySize = 0;

  addKill(elite: boolean, boss: boolean): void {
    this.kills += 1;
    if (elite) this.eliteKills += 1;
    if (boss) this.bossKills += 1;
  }

  setElapsed(seconds: number): void {
    this.elapsed = seconds;
  }

  setPromotions(count: number): void {
    this.promotions = count;
  }

  trackArmySize(count: number): void {
    if (count > this.maxArmySize) this.maxArmySize = count;
  }

  get score(): number {
    return computeScore({
      kills: this.kills,
      elapsedSeconds: this.elapsed,
      promotions: this.promotions,
      eliteKills: this.eliteKills,
      bossKills: this.bossKills,
    });
  }

  reset(): void {
    this.kills = 0;
    this.eliteKills = 0;
    this.bossKills = 0;
    this.elapsed = 0;
    this.promotions = 0;
    this.maxArmySize = 0;
  }
}
