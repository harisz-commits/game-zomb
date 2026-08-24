import type {
  AdOutcome,
  PlatformService,
  RewardedOutcome,
  Unsubscribe,
} from './PlatformService';
import type { YtGameError, YtGameSdk } from './ytgame';

/** Zertifizierungsgrenze für einen Spielstand. */
const SAVE_LIMIT_BYTES = 64 * 1024;

/**
 * Implementierung für YouTube Playables.
 *
 * Gegen die offizielle Dokumentation und das offizielle Beispielprojekt
 * geprüft (Quellen im Kopf von `ytgame.d.ts`). Zwei Prinzipien tragen sie:
 *
 * 1. **Feature-Detection statt Annahme.** Jede SDK-Methode wird vor dem
 *    Aufruf geprüft; fehlt sie, gibt es einen definierten Rückfall.
 * 2. **Nichts wirft.** Ein Fehler im SDK darf keine Runde beenden.
 *
 * Das SDK wird per Script-Tag von YouTube geladen (siehe `index.html`) und
 * hängt danach an `window.ytgame`. Das Bundle lädt nichts nach.
 */
export class YouTubePlatformService implements PlatformService {
  readonly id = 'youtube' as const;

  private readonly sdk: YtGameSdk;
  private audioEnabled = true;
  private loadCompleted = false;
  private readonly audioHandlers = new Set<(enabled: boolean) => void>();
  private readonly pauseHandlers = new Set<() => void>();
  private readonly resumeHandlers = new Set<() => void>();

  constructor(sdk: YtGameSdk) {
    this.sdk = sdk;
  }

  /**
   * Liefert das SDK, wenn die Seite in einem Playables-Container läuft.
   *
   * Massgeblich ist `IN_PLAYABLES_ENV` — der dokumentierte Weg. Das blosse
   * Vorhandensein von `window.ytgame` genügt nicht: Das Script kann geladen
   * sein, während die Seite in einem gewöhnlichen Browser-Tab steht.
   */
  static detect(): YtGameSdk | null {
    if (typeof window === 'undefined') return null;
    const sdk = window.ytgame;
    if (!sdk) return null;
    return sdk.IN_PLAYABLES_ENV === true ? sdk : null;
  }

  async initialize(): Promise<void> {
    const system = this.sdk.system;
    this.audioEnabled = this.safe(() => system?.isAudioEnabled?.(), true) ?? true;

    // Die SDK-Rückrufe werden genau einmal registriert und dann an die
    // internen Handler-Mengen verteilt — so bleibt Mehrfach-Abo möglich.
    this.safe(() =>
      system?.onAudioEnabledChange?.((enabled: boolean) => {
        this.audioEnabled = enabled;
        for (const handler of [...this.audioHandlers]) handler(enabled);
      }),
    );
    this.safe(() =>
      system?.onPause?.(() => {
        for (const handler of [...this.pauseHandlers]) handler();
      }),
    );
    this.safe(() =>
      system?.onResume?.(() => {
        for (const handler of [...this.resumeHandlers]) handler();
      }),
    );

    console.info(`[platform] ytgame SDK ${this.sdk.SDK_VERSION ?? '(unknown version)'}`);
  }

  firstFrameReady(): void {
    this.safe(() => this.sdk.game?.firstFrameReady?.());
  }

  gameReady(): void {
    this.safe(() => this.sdk.game?.gameReady?.());
  }

  async loadGame(): Promise<string | null> {
    const load = this.sdk.game?.loadData;
    if (!load) {
      // Auch ohne Speicher-API gilt: erst laden, dann speichern dürfen.
      this.loadCompleted = true;
      return null;
    }
    try {
      const raw = await load();
      // Das offizielle Beispiel beschreibt den aufgelösten Wert als
      // „geparstes JSON oder undefined", `saveData` nimmt dagegen eine
      // Zeichenkette. Beides wird akzeptiert, statt auf eine Variante zu
      // wetten.
      if (typeof raw === 'string') return raw.length > 0 ? raw : null;
      if (raw && typeof raw === 'object') return JSON.stringify(raw);
      return null;
    } catch (error) {
      this.logError('loadData failed', error);
      return null;
    } finally {
      this.loadCompleted = true;
    }
  }

  async saveGame(data: string): Promise<boolean> {
    // Zertifizierungsanforderung: `loadData` MUSS vor `saveData` abgewartet
    // werden. Ein Verstoss würde den bestehenden Spielstand überschreiben,
    // bevor man ihn gesehen hat.
    if (!this.loadCompleted) {
      this.logWarning('saveData called before loadData completed — skipped');
      return false;
    }

    const size = new Blob([data]).size;
    if (size > SAVE_LIMIT_BYTES) {
      this.logError(`save payload ${size} bytes exceeds the ${SAVE_LIMIT_BYTES} byte limit`);
      return false;
    }

    const save = this.sdk.game?.saveData;
    if (!save) {
      this.logWarning('saveData unavailable — progress not persisted');
      return false;
    }
    try {
      await save(data);
      return true;
    } catch (error) {
      this.logError('saveData failed', error);
      return false;
    }
  }

  async sendScore(score: number): Promise<void> {
    const send = this.sdk.engagement?.sendScore;
    if (!send) return;
    try {
      await send({ value: score });
    } catch (error) {
      this.logError('sendScore failed', error);
    }
  }

  async showInterstitial(): Promise<AdOutcome> {
    const request = this.sdk.ads?.requestInterstitialAd;
    if (!request) return { status: 'unavailable', reason: 'no-ads-api' };
    try {
      await request();
      return { status: 'shown' };
    } catch (error) {
      return { status: 'failed', reason: describeError(error) };
    }
  }

  async showRewardedAd(rewardId: string): Promise<RewardedOutcome> {
    const request = this.sdk.ads?.requestRewardedAd;
    if (!request) return { status: 'unavailable', reason: 'no-ads-api' };
    try {
      // Aufgelöst heisst: vollständig gesehen, Belohnung verdient.
      await request(rewardId);
      return { status: 'rewarded' };
    } catch (error) {
      // Abbruch und technischer Fehler sehen für den Spieler gleich aus —
      // er bekommt nichts. Unterschieden wird nur fürs Log.
      const reason = describeError(error);
      return errorTypeOf(error) === 'API_UNAVAILABLE'
        ? { status: 'unavailable', reason }
        : { status: 'dismissed', reason };
    }
  }

  getLanguage(): string {
    return (
      this.safe(() => this.sdk.system?.getLanguage?.(), 'en') ??
      navigator.language ??
      'en'
    );
  }

  isAudioEnabled(): boolean {
    return this.audioEnabled;
  }

  subscribeAudioChange(handler: (enabled: boolean) => void): Unsubscribe {
    this.audioHandlers.add(handler);
    return () => this.audioHandlers.delete(handler);
  }

  subscribePause(handler: () => void): Unsubscribe {
    this.pauseHandlers.add(handler);
    return () => this.pauseHandlers.delete(handler);
  }

  subscribeResume(handler: () => void): Unsubscribe {
    this.resumeHandlers.add(handler);
    return () => this.resumeHandlers.delete(handler);
  }

  logError(message: string, error?: unknown): void {
    console.error(`[game] ${message}`, error ?? '');
    const full = error ? `${message}: ${describeError(error)}` : message;
    // `health`, nicht `game` — der ursprüngliche Aufruf ging ins Leere.
    this.safe(() => this.sdk.health?.logError?.(full));
  }

  logWarning(message: string): void {
    console.warn(`[game] ${message}`);
    this.safe(() => this.sdk.health?.logWarning?.(message));
  }

  /** Führt einen SDK-Aufruf aus und schluckt jeden Fehler. */
  private safe<T>(fn: () => T, fallback?: T): T | undefined {
    try {
      return fn();
    } catch (error) {
      console.warn('[platform] ytgame call failed', error);
      return fallback;
    }
  }
}

function errorTypeOf(error: unknown): string | undefined {
  if (typeof error === 'object' && error !== null && 'errorType' in error) {
    return (error as YtGameError).errorType;
  }
  return undefined;
}

function describeError(error: unknown): string {
  const type = errorTypeOf(error);
  if (type) return type;
  if (error instanceof Error) return error.message;
  return String(error);
}
