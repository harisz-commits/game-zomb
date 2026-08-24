import type { RunResult, RunStats } from '../core/Types';
import type { SaveData } from '../save/SaveSchema';
import { REWARDS, SCORE } from '../config/rewards';
import { UNLOCKS } from '../config/metaUpgrades';
import { upgradeTotal } from './MetaProgression';

export interface RunRewards {
  coins: number;
  techParts: number;
  /** Anteil, den die Aufwertung „Salvage Crew" beigesteuert hat. */
  salvageBonus: number;
}

/**
 * Was eine Runde einbringt.
 *
 * Getrennt vom Schreiben in den Spielstand, damit der Ergebnisbildschirm
 * dieselbe Rechnung anzeigen kann, die auch gebucht wird — und damit sie
 * ohne Spielstand testbar bleibt.
 */
export function computeRewards(stats: RunStats, salvage: number): RunRewards {
  const base =
    stats.sectorsCleared * REWARDS.coinsPerSector +
    stats.kills * REWARDS.coinsPerKill +
    stats.bossesKilled * REWARDS.coinsPerBoss;

  const coins = Math.round(base * (1 + salvage));
  return {
    coins,
    techParts: stats.bossesKilled * REWARDS.techPartsPerBoss,
    salvageBonus: coins - Math.round(base),
  };
}

/**
 * Der Score.
 *
 * Verbleibende Kampfkraft geht gedämpft ein (Exponent < 1): Sie wächst über
 * eine Runde um Zehnerpotenzen und würde ungedämpft jeden anderen Beitrag
 * bedeutungslos machen — Sektoren, Kills und Bosse zählten dann gar nicht.
 */
export function computeScore(stats: RunStats, victory: boolean): number {
  const power = Math.max(0, stats.peakCombatPower);
  const score =
    stats.sectorsCleared * SCORE.perSector +
    stats.kills * SCORE.perKill +
    stats.bossesKilled * SCORE.perBoss +
    stats.peakTierIndex * SCORE.perTierIndex +
    Math.pow(power, SCORE.combatPowerExponent) * SCORE.combatPowerFactor;

  return Math.round(victory ? score * 1.25 : score);
}

/**
 * Bucht das Ergebnis einer Runde in den Spielstand.
 *
 * Einzige Stelle, die den Spielstand nach einer Runde verändert — sonst
 * verteilt sich die Buchhaltung über mehrere Szenen und driftet auseinander.
 */
export function bankRunResult(save: SaveData, result: RunResult): RunRewards {
  const rewards = computeRewards(result.stats, upgradeTotal(save, 'salvage'));

  save.meta.coins += rewards.coins;
  save.meta.techParts += rewards.techParts;
  save.meta.xp += result.stats.sectorsCleared;

  save.stats.runs += 1;
  save.stats.kills += result.stats.kills;
  save.stats.bestScore = Math.max(save.stats.bestScore, result.score);
  if (result.mode === 'endless') {
    save.stats.bestEndlessSector = Math.max(
      save.stats.bestEndlessSector,
      result.stats.sectorsCleared,
    );
  }

  save.progress.highestTierIndex = Math.max(
    save.progress.highestTierIndex,
    result.stats.peakTierIndex,
  );
  if (result.victory && result.mode === 'campaign') {
    save.progress.campaignSector = Math.max(
      save.progress.campaignSector,
      result.stats.sectorsCleared,
    );
  }

  // Der Endlosmodus öffnet sich, sobald ein Feldzug überstanden ist — er
  // setzt voraus, dass man das Spiel einmal ganz gesehen hat.
  if (result.victory && !save.unlocks.includes(UNLOCKS.endless)) {
    save.unlocks.push(UNLOCKS.endless);
  }

  return rewards;
}
