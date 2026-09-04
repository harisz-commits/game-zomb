import type { SaveData } from '../types/game';

export const CURRENT_SAVE_VERSION = 1;

/** Playables hard limit is 3 MiB; we stay far below it and guard anyway. */
export const MAX_SAVE_BYTES = 400 * 1024;

/** Storage backend abstraction - real implementation is the Playables adapter. */
export interface SaveStorage {
  load(): Promise<string | null>;
  save(data: string): Promise<void>;
}

export function createDefaultSave(): SaveData {
  return {
    version: CURRENT_SAVE_VERSION,
    tutorialCompleted: false,
    bestScore: 0,
    bestEndlessScore: 0,
    highestPromotion: 0,
    totalKills: 0,
    gamesPlayed: 0,
    endlessUnlocked: false,
    settings: {
      musicEnabled: true,
      sfxEnabled: true,
      damageNumbers: true,
    },
    unlockedCosmetics: [],
  };
}

function toInt(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
}

function toBool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

/**
 * Migrates any historical or corrupt payload to the current shape.
 * This never throws and never returns a partially populated object - a broken
 * save always degrades to defaults instead of crashing the game.
 */
export function migrateSave(raw: unknown): SaveData {
  const base = createDefaultSave();
  if (!raw || typeof raw !== 'object') return base;

  const data = raw as Record<string, unknown>;
  const version = toInt(data.version, 0);

  // v0 (pre-versioning) and v1 share the same field names; unknown/newer
  // versions fall back to defaults for anything we cannot interpret.
  const settings =
    data.settings && typeof data.settings === 'object'
      ? (data.settings as Record<string, unknown>)
      : {};

  const cosmetics = Array.isArray(data.unlockedCosmetics)
    ? data.unlockedCosmetics.filter((c): c is string => typeof c === 'string').slice(0, 200)
    : base.unlockedCosmetics;

  return {
    version: CURRENT_SAVE_VERSION,
    tutorialCompleted: toBool(data.tutorialCompleted, base.tutorialCompleted),
    bestScore: toInt(data.bestScore, base.bestScore),
    // v0 had no separate endless best - seed it from the campaign best.
    bestEndlessScore: toInt(
      data.bestEndlessScore,
      version < 1 ? toInt(data.bestScore, 0) : base.bestEndlessScore,
    ),
    highestPromotion: toInt(data.highestPromotion, base.highestPromotion),
    totalKills: toInt(data.totalKills, base.totalKills),
    gamesPlayed: toInt(data.gamesPlayed, base.gamesPlayed),
    endlessUnlocked: toBool(
      data.endlessUnlocked,
      // Anyone who already finished a run keeps endless unlocked.
      toInt(data.gamesPlayed, 0) > 0 ? true : base.endlessUnlocked,
    ),
    settings: {
      musicEnabled: toBool(settings.musicEnabled, base.settings.musicEnabled),
      sfxEnabled: toBool(settings.sfxEnabled, base.settings.sfxEnabled),
      damageNumbers: toBool(settings.damageNumbers, base.settings.damageNumbers),
    },
    unlockedCosmetics: cosmetics,
  };
}

export function parseSave(json: string | null): SaveData {
  if (!json) return createDefaultSave();
  try {
    return migrateSave(JSON.parse(json));
  } catch {
    return createDefaultSave();
  }
}

/**
 * Owns the persisted meta-progression. Writes are debounced and always
 * fire-and-forget so a slow cloud save can never stall the game loop.
 */
export class SaveSystem {
  private data: SaveData = createDefaultSave();
  private loaded = false;
  private pending = false;
  private writeTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly storage: SaveStorage,
    private readonly onError: (err: unknown) => void = () => {},
    private readonly debounceMs = 900,
  ) {}

  get current(): SaveData {
    return this.data;
  }

  get isLoaded(): boolean {
    return this.loaded;
  }

  async load(): Promise<SaveData> {
    try {
      const raw = await this.storage.load();
      this.data = parseSave(raw);
    } catch (err) {
      this.onError(err);
      this.data = createDefaultSave();
    }
    this.loaded = true;
    return this.data;
  }

  /** Mutates the save and schedules a debounced write. */
  update(mutator: (data: SaveData) => void): void {
    mutator(this.data);
    this.scheduleWrite();
  }

  private scheduleWrite(): void {
    this.pending = true;
    if (this.writeTimer !== null) return;
    this.writeTimer = setTimeout(() => {
      this.writeTimer = null;
      void this.flush();
    }, this.debounceMs);
  }

  async flush(): Promise<void> {
    if (!this.pending) return;
    this.pending = false;
    try {
      let json = JSON.stringify(this.data);
      if (json.length > MAX_SAVE_BYTES) {
        // Defensive: shed the only unbounded field before we ever get close
        // to the platform limit.
        this.data.unlockedCosmetics = [];
        json = JSON.stringify(this.data);
      }
      await this.storage.save(json);
    } catch (err) {
      this.onError(err);
    }
  }
}
