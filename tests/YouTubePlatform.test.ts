import { describe, expect, it, vi } from 'vitest';
import { YouTubePlatformService } from '../src/platform/YouTubePlatformService';
import { AdManager } from '../src/ads/AdManager';
import { AD_RULES, REWARD_IDS } from '../src/config/ads';
import { createDefaultSave } from '../src/save/SaveSchema';
import type { YtGameSdk } from '../src/platform/ytgame';
import type { PlatformService } from '../src/platform/PlatformService';

/** Eine Attrappe des SDK, die genau die dokumentierte Form hat. */
function fakeSdk(overrides: Partial<YtGameSdk> = {}): YtGameSdk {
  return {
    SDK_VERSION: '1.0.0',
    IN_PLAYABLES_ENV: true,
    game: {
      firstFrameReady: vi.fn(),
      gameReady: vi.fn(),
      loadData: vi.fn(async () => ''),
      saveData: vi.fn(async () => {}),
    },
    health: { logError: vi.fn(), logWarning: vi.fn() },
    engagement: { sendScore: vi.fn(async () => {}) },
    ads: {
      requestInterstitialAd: vi.fn(async () => {}),
      requestRewardedAd: vi.fn(async () => {}),
    },
    system: {
      getLanguage: () => 'de-DE',
      isAudioEnabled: () => true,
      onAudioEnabledChange: vi.fn(),
      onPause: vi.fn(),
      onResume: vi.fn(),
    },
    ...overrides,
  };
}

describe('environment detection', () => {
  /**
   * Das Script kann geladen sein, während die Seite in einem gewöhnlichen
   * Tab steht — etwa in der Vercel-Vorschau. Massgeblich ist die
   * dokumentierte Flagge, nicht das blosse Vorhandensein des Objekts.
   */
  it('only claims the playables environment when the SDK says so', () => {
    const original = globalThis.window;
    const set = (value: unknown): void => {
      (globalThis as { window?: unknown }).window = value;
    };

    set({ ytgame: fakeSdk({ IN_PLAYABLES_ENV: true }) });
    expect(YouTubePlatformService.detect()).not.toBeNull();

    set({ ytgame: fakeSdk({ IN_PLAYABLES_ENV: false }) });
    expect(YouTubePlatformService.detect()).toBeNull();

    // Ganz ohne die Flagge — so sieht das SDK ausserhalb eines Containers aus.
    const withoutFlag = fakeSdk();
    delete withoutFlag.IN_PLAYABLES_ENV;
    set({ ytgame: withoutFlag });
    expect(YouTubePlatformService.detect()).toBeNull();

    set({});
    expect(YouTubePlatformService.detect()).toBeNull();

    set(original);
  });
});

describe('logging namespace', () => {
  /**
   * Der ursprüngliche Code rief `ytgame.game.logError` auf — diese Methode
   * existiert nicht. Fehler verschwanden dadurch spurlos.
   */
  it('reports through ytgame.health, not ytgame.game', () => {
    const sdk = fakeSdk();
    const service = new YouTubePlatformService(sdk);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    service.logError('kaputt', new Error('grund'));
    service.logWarning('achtung');

    expect(sdk.health!.logError).toHaveBeenCalledTimes(1);
    expect(sdk.health!.logWarning).toHaveBeenCalledWith('achtung');
    expect(sdk.game).not.toHaveProperty('logError');
    vi.restoreAllMocks();
  });
});

describe('saving', () => {
  /** Zertifizierungsanforderung: erst laden, dann speichern dürfen. */
  it('refuses to save before loadData has completed', async () => {
    const sdk = fakeSdk();
    const service = new YouTubePlatformService(sdk);
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(await service.saveGame('{"a":1}')).toBe(false);
    expect(sdk.game!.saveData).not.toHaveBeenCalled();

    await service.loadGame();
    expect(await service.saveGame('{"a":1}')).toBe(true);
    expect(sdk.game!.saveData).toHaveBeenCalledWith('{"a":1}');
    vi.restoreAllMocks();
  });

  it('refuses a payload beyond the 64 KiB limit', async () => {
    const sdk = fakeSdk();
    const service = new YouTubePlatformService(sdk);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await service.loadGame();

    expect(await service.saveGame('x'.repeat(70 * 1024))).toBe(false);
    expect(sdk.game!.saveData).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  /**
   * Die Dokumentation beschreibt den geladenen Wert als „geparstes JSON oder
   * undefined", `saveData` nimmt dagegen eine Zeichenkette. Beides muss
   * ankommen, statt auf eine Variante zu wetten.
   */
  it('accepts a loaded save as string or as object', async () => {
    const asString = new YouTubePlatformService(
      fakeSdk({ game: { loadData: async () => '{"coins":5}' } }),
    );
    expect(await asString.loadGame()).toBe('{"coins":5}');

    const asObject = new YouTubePlatformService(
      fakeSdk({ game: { loadData: async () => ({ coins: 5 }) } }),
    );
    expect(await asObject.loadGame()).toBe('{"coins":5}');

    const empty = new YouTubePlatformService(
      fakeSdk({ game: { loadData: async () => undefined } }),
    );
    expect(await empty.loadGame()).toBeNull();
  });

  it('survives a save API that throws', async () => {
    const sdk = fakeSdk({
      game: {
        loadData: async () => '',
        saveData: async () => {
          throw { errorType: 'SIZE_LIMIT_EXCEEDED' };
        },
      },
    });
    const service = new YouTubePlatformService(sdk);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await service.loadGame();
    expect(await service.saveGame('{}')).toBe(false);
    vi.restoreAllMocks();
  });
});

describe('ads', () => {
  it('passes the reward id the SDK requires', async () => {
    const sdk = fakeSdk();
    const service = new YouTubePlatformService(sdk);
    await service.showRewardedAd(REWARD_IDS.doubleRewards);
    expect(sdk.ads!.requestRewardedAd).toHaveBeenCalledWith(REWARD_IDS.doubleRewards);
  });

  it('reports a dismissed ad separately from a missing API', async () => {
    const dismissed = new YouTubePlatformService(
      fakeSdk({ ads: { requestRewardedAd: async () => { throw { errorType: 'UNKNOWN' }; } } }),
    );
    expect((await dismissed.showRewardedAd('x')).status).toBe('dismissed');

    const unavailable = new YouTubePlatformService(
      fakeSdk({ ads: { requestRewardedAd: async () => { throw { errorType: 'API_UNAVAILABLE' }; } } }),
    );
    expect((await unavailable.showRewardedAd('x')).status).toBe('unavailable');

    const missing = new YouTubePlatformService(fakeSdk({ ads: {} }));
    expect((await missing.showRewardedAd('x')).status).toBe('unavailable');
  });
});

describe('ad pacing', () => {
  function platformStub(): PlatformService {
    return {
      showInterstitial: vi.fn(async () => ({ status: 'shown' as const })),
      showRewardedAd: vi.fn(async () => ({ status: 'rewarded' as const })),
      logWarning: vi.fn(),
    } as unknown as PlatformService;
  }

  /** Die ersten Runden entscheiden, ob jemand bleibt. */
  it('leaves the first runs uninterrupted', () => {
    const ads = new AdManager(platformStub());
    const save = createDefaultSave();
    for (let runs = 0; runs < AD_RULES.interstitialAfterRuns; runs += 1) {
      save.stats.runs = runs;
      expect(ads.shouldShowInterstitial(save, 10_000)).toBe(false);
    }
  });

  it('keeps a cooldown between two interstitials', async () => {
    const platform = platformStub();
    const ads = new AdManager(platform);
    const save = createDefaultSave();
    save.stats.runs = AD_RULES.interstitialAfterRuns * 2;

    expect(await ads.maybeShowInterstitial(save, 10_000)).toBe(true);
    // Direkt danach nicht noch einmal, auch wenn die Rundenzahl passt.
    expect(await ads.maybeShowInterstitial(save, 10_010)).toBe(false);
    expect(
      await ads.maybeShowInterstitial(save, 10_000 + AD_RULES.interstitialCooldownSeconds + 1),
    ).toBe(true);
    expect(platform.showInterstitial).toHaveBeenCalledTimes(2);
  });

  it('grants a reward only when the ad was actually watched', async () => {
    const watched = new AdManager(platformStub());
    expect(await watched.offerReward(REWARD_IDS.doubleRewards)).toBe(true);

    const skipped = new AdManager({
      showRewardedAd: async () => ({ status: 'dismissed' as const, reason: 'closed' }),
      logWarning: vi.fn(),
    } as unknown as PlatformService);
    expect(await skipped.offerReward(REWARD_IDS.doubleRewards)).toBe(false);
  });
});
