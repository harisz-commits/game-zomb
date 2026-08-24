/**
 * Oberfläche des YouTube-Playables-SDK (`window.ytgame`).
 *
 * Anders als in Phase 1 ist das keine Annahme mehr: Die Namen stammen aus der
 * offiziellen Dokumentation und dem offiziellen Beispielprojekt.
 *
 *   https://developers.google.com/youtube/gaming/playables/reference/getting_started
 *   https://developers.google.com/youtube/gaming/playables/certification/requirements_integration
 *   https://github.com/phaserjs/template-youtube-playables
 *
 * Die Prüfung deckte drei Fehler in der ursprünglichen Annahme auf:
 *
 *  1. `logError`/`logWarning` liegen unter `ytgame.health`, nicht unter
 *     `ytgame.game`. Die Aufrufe gingen bisher ins Leere.
 *  2. `requestRewardedAd` erwartet eine `rewardId`.
 *  3. Die Umgebungserkennung heisst `IN_PLAYABLES_ENV` und ist der
 *     dokumentierte Weg — nicht das blosse Vorhandensein von `window.ytgame`.
 *
 * Alle Felder bleiben optional: Das SDK wird von der Plattform injiziert, und
 * ein fehlendes Feld darf niemals eine Ausnahme auslösen.
 */

/** Fehlerarten, die das SDK an geworfenen Objekten als `errorType` mitgibt. */
export type YtGameErrorType =
  | 'UNKNOWN'
  | 'API_UNAVAILABLE'
  | 'INVALID_PARAMS'
  | 'SIZE_LIMIT_EXCEEDED';

export interface YtGameError {
  errorType?: YtGameErrorType;
  message?: string;
}

export interface YtGameSdk {
  SDK_VERSION?: string;
  /** Läuft die Seite in einem echten Playables-Container? */
  IN_PLAYABLES_ENV?: boolean;

  game?: {
    firstFrameReady?: () => void;
    gameReady?: () => void;
    /**
     * Der geladene Spielstand. Das offizielle Beispiel beschreibt den
     * aufgelösten Wert als „geparstes JSON oder undefined", `saveData`
     * nimmt dagegen eine Zeichenkette. Deshalb wird beides akzeptiert.
     */
    loadData?: () => Promise<string | object | undefined>;
    /** Höchstens 64 KiB (Zertifizierungsanforderung). */
    saveData?: (data: string) => Promise<void>;
  };

  /** Fehlerkanal — NICHT unter `game`. */
  health?: {
    logError?: (message?: string) => void;
    logWarning?: (message?: string) => void;
  };

  engagement?: {
    sendScore?: (payload: { value: number }) => Promise<void>;
    openYTContent?: (payload: { id: string }) => void;
  };

  ads?: {
    requestInterstitialAd?: () => Promise<void>;
    /** Erwartet eine Kennung, an der die Belohnung hängt. */
    requestRewardedAd?: (rewardId: string) => Promise<void>;
  };

  system?: {
    getLanguage?: () => string;
    isAudioEnabled?: () => boolean;
    onAudioEnabledChange?: (handler: (enabled: boolean) => void) => void;
    onPause?: (handler: () => void) => void;
    onResume?: (handler: () => void) => void;
  };
}

declare global {
  interface Window {
    ytgame?: YtGameSdk;
  }
}
