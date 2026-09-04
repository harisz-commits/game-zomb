import { getSeedFromUrl } from '../config/GameConfig';
import { SaveSystem } from '../systems/SaveSystem';
import { playables } from '../systems/YouTubePlayablesAdapter';

/**
 * Process-wide services shared by all scenes.
 *
 * The save system is wired to the Playables adapter, which transparently
 * falls back to localStorage outside of a Playables host.
 */
export const save = new SaveSystem(playables, (err) => playables.logError(err));

/** Seed for the next run: `?seed=` for reproducible tests, else time based. */
export function nextRunSeed(): number {
  return getSeedFromUrl() ?? (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
}

/**
 * Loads the save with a hard timeout so a slow cloud round trip can never
 * block "time to interactive".
 */
export async function loadSaveWithTimeout(timeoutMs = 2500): Promise<void> {
  await Promise.race([
    save.load(),
    new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
  ]);
}
