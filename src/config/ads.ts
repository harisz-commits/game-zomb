/**
 * Werbung im Spieldesign.
 *
 * Der Grundsatz aus der Spezifikation: Das Spiel muss ohne jede Einblendung
 * vollständig funktionieren. Werbung ist ein Angebot, nie eine Mautstelle.
 *
 * Belohnte Werbung wird deshalb nur an Stellen angeboten, an denen der
 * Spieler etwas GEWINNT, das er sonst nicht hätte — nie, um etwas
 * zurückzukaufen, das ihm genommen wurde.
 */

/**
 * Kennungen der belohnten Platzierungen.
 *
 * Das SDK erwartet sie als Argument von `requestRewardedAd`, und YouTube
 * ordnet ihnen die Auslieferung zu. Sie gehören deshalb an eine Stelle und
 * nicht als Zeichenkette in den Aufruf gestreut.
 */
export const REWARD_IDS = {
  /** Verdoppelt die Ausbeute einer beendeten Runde. */
  doubleRewards: 'double_rewards',
} as const;

export type RewardId = (typeof REWARD_IDS)[keyof typeof REWARD_IDS];

export const AD_RULES = {
  /**
   * Interstitials erst ab dieser Rundenzahl — die ersten Runden entscheiden,
   * ob jemand bleibt, und dürfen nicht unterbrochen werden.
   */
  interstitialAfterRuns: 3,
  /** Und dann höchstens jede n-te Runde. */
  interstitialEveryRuns: 3,
  /** Kürzeste Zeit zwischen zwei Interstitials in Sekunden. */
  interstitialCooldownSeconds: 180,
} as const;
