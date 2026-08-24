import type { PlatformService } from '../platform/PlatformService';
import type { SaveData } from '../save/SaveSchema';
import { AD_RULES, type RewardId } from '../config/ads';

/**
 * Entscheidet, wann Werbung gezeigt wird.
 *
 * Die Regeln stehen an einer Stelle, weil sie sonst über Szenen verstreut
 * wären und niemand mehr sagen könnte, wie oft ein Spieler tatsächlich
 * unterbrochen wird.
 *
 * Grundsatz aus der Spezifikation: Das Spiel muss ohne jede Einblendung
 * vollständig funktionieren. Ein Interstitial darf nie mitten in einer Runde
 * stehen, und eine belohnte Werbung ist immer ein Angebot obendrauf — nie
 * der Rückkauf von etwas, das genommen wurde.
 */
export class AdManager {
  /** Zeitpunkt des letzten Interstitials, in Sekunden seit Seitenstart. */
  private lastInterstitialAt = Number.NEGATIVE_INFINITY;

  constructor(private readonly platform: PlatformService) {}

  /**
   * Darf nach dieser Runde ein Interstitial kommen?
   *
   * @param save Spielstand — die Zahl gespielter Runden steckt darin.
   * @param nowSeconds Sekunden seit Seitenstart.
   */
  shouldShowInterstitial(save: SaveData, nowSeconds: number): boolean {
    const runs = save.stats.runs;
    // Die ersten Runden entscheiden, ob jemand bleibt.
    if (runs < AD_RULES.interstitialAfterRuns) return false;
    if (runs % AD_RULES.interstitialEveryRuns !== 0) return false;
    return nowSeconds - this.lastInterstitialAt >= AD_RULES.interstitialCooldownSeconds;
  }

  /** Zeigt ein Interstitial, wenn die Regeln es erlauben. */
  async maybeShowInterstitial(save: SaveData, nowSeconds: number): Promise<boolean> {
    if (!this.shouldShowInterstitial(save, nowSeconds)) return false;
    // Zeitpunkt VOR dem Aufruf merken: Schlägt die Einblendung fehl, soll
    // nicht sofort die nächste Gelegenheit hinterherlaufen.
    this.lastInterstitialAt = nowSeconds;
    const outcome = await this.platform.showInterstitial();
    return outcome.status === 'shown';
  }

  /**
   * Bietet eine belohnte Werbung an.
   *
   * @returns true nur, wenn die Belohnung wirklich verdient wurde.
   */
  async offerReward(rewardId: RewardId): Promise<boolean> {
    const outcome = await this.platform.showRewardedAd(rewardId);
    if (outcome.status === 'rewarded') return true;
    if (outcome.status !== 'dismissed') {
      this.platform.logWarning(`rewarded ad ${rewardId}: ${outcome.status} (${outcome.reason})`);
    }
    return false;
  }
}
