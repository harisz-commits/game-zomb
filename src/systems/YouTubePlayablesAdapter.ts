import { STORAGE_KEY } from '../config/GameConfig';
import type { SaveStorage } from './SaveSystem';

type Unsubscribe = () => void;

/**
 * The single point of contact with the YouTube Playables SDK.
 *
 * No gameplay code may reference `ytgame` directly. Everything goes through
 * this adapter, which:
 *  - degrades gracefully when the SDK is absent (local dev, unit tests),
 *  - simulates cloud saves with localStorage,
 *  - simulates pause/resume with page visibility,
 *  - swallows every SDK error (a failing telemetry call must never crash a run).
 */
class YouTubePlayablesAdapter implements SaveStorage {
  private sdk: YTGameSDK | null = null;
  private initialised = false;
  private firstFrameSent = false;
  private gameReadySent = false;

  private readonly pauseHandlers = new Set<() => void>();
  private readonly resumeHandlers = new Set<() => void>();
  private readonly audioHandlers = new Set<(enabled: boolean) => void>();

  private audioEnabled = true;
  private lastSentScore = -1;

  /** True when a real Playables host is present. */
  get isHost(): boolean {
    return this.sdk !== null;
  }

  get sdkVersion(): string {
    return this.sdk?.SDK_VERSION ?? 'local';
  }

  init(): void {
    if (this.initialised) return;
    this.initialised = true;

    this.sdk = this.detectSdk();

    if (this.sdk) {
      this.bindHostLifecycle(this.sdk);
    } else {
      this.bindLocalLifecycle();
    }
  }

  private detectSdk(): YTGameSDK | null {
    try {
      const candidate =
        (typeof window !== 'undefined' ? window.ytgame : undefined) ??
        (typeof globalThis !== 'undefined'
          ? (globalThis as { ytgame?: YTGameSDK }).ytgame
          : undefined);
      if (!candidate || typeof candidate !== 'object') return null;
      // Require the lifecycle surface we depend on.
      if (typeof candidate.game?.firstFrameReady !== 'function') return null;
      return candidate;
    } catch {
      return null;
    }
  }

  private bindHostLifecycle(sdk: YTGameSDK): void {
    this.safe(() => {
      this.audioEnabled = sdk.system.isAudioEnabled();
    });
    this.safe(() => {
      sdk.system.onAudioEnabledChange((enabled: boolean) => {
        this.audioEnabled = enabled;
        for (const handler of this.audioHandlers) handler(enabled);
      });
    });
    this.safe(() => {
      sdk.system.onPause(() => this.dispatchPause());
    });
    this.safe(() => {
      sdk.system.onResume(() => this.dispatchResume());
    });
  }

  /**
   * Local development stand-in: tab visibility drives pause/resume so the
   * "no simulation catch-up after resume" behaviour can be tested offline.
   */
  private bindLocalLifecycle(): void {
    if (typeof document === 'undefined' || typeof window === 'undefined') return;
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.dispatchPause();
      else this.dispatchResume();
    });
    window.addEventListener('blur', () => this.dispatchPause());
    window.addEventListener('focus', () => this.dispatchResume());
  }

  private dispatchPause(): void {
    for (const handler of this.pauseHandlers) handler();
  }

  private dispatchResume(): void {
    for (const handler of this.resumeHandlers) handler();
  }

  // ----------------------------------------------------------- lifecycle ---

  /** Call exactly once, right after the first frame has been rendered. */
  firstFrameReady(): void {
    if (this.firstFrameSent) return;
    this.firstFrameSent = true;
    this.safe(() => this.sdk?.game.firstFrameReady());
  }

  /** Call exactly once, when the game is actually interactive. */
  gameReady(): void {
    if (this.gameReadySent) return;
    this.gameReadySent = true;
    this.safe(() => this.sdk?.game.gameReady());
  }

  // -------------------------------------------------------------- storage ---

  async load(): Promise<string | null> {
    if (this.sdk) {
      try {
        const data = await this.sdk.game.loadData();
        return data ?? null;
      } catch (err) {
        // A missing cloud save rejects - that is expected on a first play.
        this.logWarning(err);
        return null;
      }
    }
    try {
      return typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
    } catch {
      return null;
    }
  }

  async save(data: string): Promise<void> {
    if (this.sdk) {
      try {
        await this.sdk.game.saveData(data);
        return;
      } catch (err) {
        this.logError(err);
        return;
      }
    }
    try {
      if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, data);
    } catch {
      /* storage disabled - meta progression is simply not persisted */
    }
  }

  // ---------------------------------------------------------- engagement ---

  /**
   * Reports the run score. Only ever the same score type, and only when it
   * beats what we already reported in this session.
   */
  sendScore(score: number): void {
    const value = Math.max(0, Math.floor(score));
    if (!Number.isFinite(value)) return;
    if (value <= this.lastSentScore) return;
    this.lastSentScore = value;

    if (this.sdk) {
      this.safe(() => {
        void this.sdk?.engagement.sendScore({ value }).catch((err: unknown) => {
          this.logWarning(err);
        });
      });
      return;
    }
    if (import.meta.env.DEV) {
      console.info('[playables:local] sendScore', value);
    }
  }

  // --------------------------------------------------------------- system ---

  isAudioEnabled(): boolean {
    if (!this.sdk) return this.audioEnabled;
    let enabled = this.audioEnabled;
    this.safe(() => {
      enabled = this.sdk!.system.isAudioEnabled();
    });
    this.audioEnabled = enabled;
    return enabled;
  }

  onAudioEnabledChange(handler: (enabled: boolean) => void): Unsubscribe {
    this.audioHandlers.add(handler);
    return () => this.audioHandlers.delete(handler);
  }

  onPause(handler: () => void): Unsubscribe {
    this.pauseHandlers.add(handler);
    return () => this.pauseHandlers.delete(handler);
  }

  onResume(handler: () => void): Unsubscribe {
    this.resumeHandlers.add(handler);
    return () => this.resumeHandlers.delete(handler);
  }

  getLanguage(): string {
    if (this.sdk) {
      let lang = 'en';
      this.safe(() => {
        lang = this.sdk!.system.getLanguage() || 'en';
      });
      return lang;
    }
    try {
      return (typeof navigator !== 'undefined' && navigator.language) || 'en';
    } catch {
      return 'en';
    }
  }

  // --------------------------------------------------------------- health ---

  logError(error: unknown): void {
    if (this.sdk) {
      try {
        this.sdk.health.logError(this.describe(error));
      } catch {
        /* ignore */
      }
      return;
    }
    console.error('[playables:local] error', error);
  }

  logWarning(warning: unknown): void {
    if (this.sdk) {
      try {
        this.sdk.health.logWarning(this.describe(warning));
      } catch {
        /* ignore */
      }
      return;
    }
    if (import.meta.env.DEV) console.warn('[playables:local] warning', warning);
  }

  private describe(value: unknown): string {
    if (value instanceof Error) return `${value.name}: ${value.message}`;
    if (typeof value === 'string') return value;
    try {
      return JSON.stringify(value)?.slice(0, 500) ?? String(value);
    } catch {
      return String(value);
    }
  }

  private safe(fn: () => void): void {
    try {
      fn();
    } catch (err) {
      console.warn('[playables] SDK call failed', err);
    }
  }
}

/** Process-wide singleton. */
export const playables = new YouTubePlayablesAdapter();
export type { YouTubePlayablesAdapter };
