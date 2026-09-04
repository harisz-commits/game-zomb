import { describe, expect, it, vi } from 'vitest';
import {
  CURRENT_SAVE_VERSION,
  SaveSystem,
  createDefaultSave,
  migrateSave,
  parseSave,
  type SaveStorage,
} from '../src/systems/SaveSystem';

function memoryStorage(initial: string | null = null): SaveStorage & { value: string | null } {
  return {
    value: initial,
    async load() {
      return this.value;
    },
    async save(data: string) {
      this.value = data;
    },
  };
}

describe('save migration', () => {
  it('returns defaults for null, garbage and wrong types', () => {
    expect(parseSave(null)).toEqual(createDefaultSave());
    expect(parseSave('not json')).toEqual(createDefaultSave());
    expect(migrateSave(undefined)).toEqual(createDefaultSave());
    expect(migrateSave(42)).toEqual(createDefaultSave());
    expect(migrateSave('a string')).toEqual(createDefaultSave());
  });

  it('upgrades an unversioned v0 payload', () => {
    const migrated = migrateSave({ bestScore: 12500, totalKills: 8394, gamesPlayed: 12 });

    expect(migrated.version).toBe(CURRENT_SAVE_VERSION);
    expect(migrated.bestScore).toBe(12500);
    expect(migrated.totalKills).toBe(8394);
    expect(migrated.gamesPlayed).toBe(12);
    // v0 had no endless best - it is seeded from the campaign best.
    expect(migrated.bestEndlessScore).toBe(12500);
    // Anyone who already played keeps endless unlocked.
    expect(migrated.endlessUnlocked).toBe(true);
    expect(migrated.settings.musicEnabled).toBe(true);
  });

  it('keeps a valid v1 payload intact', () => {
    const original = createDefaultSave();
    original.bestScore = 900;
    original.highestPromotion = 5;
    original.tutorialCompleted = true;
    original.settings.musicEnabled = false;
    original.unlockedCosmetics = ['skin_a'];

    expect(migrateSave(JSON.parse(JSON.stringify(original)))).toEqual(original);
  });

  it('sanitises hostile or corrupt field values', () => {
    const migrated = migrateSave({
      version: 1,
      bestScore: -50,
      totalKills: 'lots',
      gamesPlayed: Number.NaN,
      tutorialCompleted: 'yes',
      settings: 'broken',
      unlockedCosmetics: [1, 'ok', null],
    });

    expect(migrated.bestScore).toBe(0);
    expect(migrated.totalKills).toBe(0);
    expect(migrated.gamesPlayed).toBe(0);
    expect(migrated.tutorialCompleted).toBe(false);
    expect(migrated.settings.sfxEnabled).toBe(true);
    expect(migrated.unlockedCosmetics).toEqual(['ok']);
  });

  it('floors fractional numbers', () => {
    expect(migrateSave({ version: 1, bestScore: 10.9 }).bestScore).toBe(10);
  });
});

describe('SaveSystem', () => {
  it('loads, mutates and persists', async () => {
    const storage = memoryStorage();
    const system = new SaveSystem(storage, () => {}, 0);

    await system.load();
    expect(system.isLoaded).toBe(true);
    expect(system.current.bestScore).toBe(0);

    system.update((data) => {
      data.bestScore = 4242;
    });
    await system.flush();

    expect(storage.value).toContain('4242');
    expect(parseSave(storage.value).bestScore).toBe(4242);
  });

  it('falls back to defaults when the storage read throws', async () => {
    const failing: SaveStorage = {
      load: () => Promise.reject(new Error('offline')),
      save: () => Promise.resolve(),
    };
    const onError = vi.fn();
    const system = new SaveSystem(failing, onError, 0);

    await expect(system.load()).resolves.toEqual(createDefaultSave());
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('reports write failures without throwing', async () => {
    const failing: SaveStorage = {
      load: () => Promise.resolve(null),
      save: () => Promise.reject(new Error('quota')),
    };
    const onError = vi.fn();
    const system = new SaveSystem(failing, onError, 0);

    await system.load();
    system.update((data) => {
      data.gamesPlayed = 1;
    });
    await expect(system.flush()).resolves.toBeUndefined();
    expect(onError).toHaveBeenCalled();
  });

  it('stays far below the platform save size limit', async () => {
    const storage = memoryStorage();
    const system = new SaveSystem(storage, () => {}, 0);
    await system.load();
    system.update((data) => {
      data.bestScore = 999999;
      data.totalKills = 12345678;
    });
    await system.flush();

    expect((storage.value ?? '').length).toBeLessThan(500 * 1024);
  });
});
