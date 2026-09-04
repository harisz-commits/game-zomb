/**
 * Minimal ambient typings for the YouTube Playables SDK.
 *
 * The SDK is injected by `<script src="https://www.youtube.com/game_api/v1">`
 * in index.html. It is intentionally typed as *optional* (`ytgame?: ...`) so
 * that every access has to be guarded - the game must run identically outside
 * of a Playables host (local dev, itch-style hosting, automated tests).
 *
 * Only the surface the game actually uses is declared here.
 */

export {};

declare global {
  namespace ytgame {
    interface GameNamespace {
      /** Signals that the very first rendered frame is on screen. */
      firstFrameReady(): void;
      /** Signals that the game is fully interactive. */
      gameReady(): void;
      /** Loads the cloud save blob (string, <= 3 MiB). */
      loadData(): Promise<string>;
      /** Persists the cloud save blob (string, <= 3 MiB). */
      saveData(data: string): Promise<void>;
    }

    interface EngagementNamespace {
      sendScore(score: { value: number }): Promise<void>;
    }

    interface SystemNamespace {
      isAudioEnabled(): boolean;
      onAudioEnabledChange(callback: (enabled: boolean) => void): void;
      onPause(callback: () => void): void;
      onResume(callback: () => void): void;
      getLanguage(): string;
    }

    interface HealthNamespace {
      logError(error?: unknown): void;
      logWarning(warning?: unknown): void;
    }
  }

  interface YTGameSDK {
    readonly SDK_VERSION?: string;
    game: ytgame.GameNamespace;
    engagement: ytgame.EngagementNamespace;
    system: ytgame.SystemNamespace;
    health: ytgame.HealthNamespace;
  }

  // eslint-disable-next-line no-var
  var ytgame: YTGameSDK | undefined;

  interface Window {
    ytgame?: YTGameSDK;
  }

  interface Performance {
    /** Non-standard, Chromium only. Used by the debug overlay when present. */
    memory?: {
      usedJSHeapSize: number;
      totalJSHeapSize: number;
      jsHeapSizeLimit: number;
    };
  }
}
