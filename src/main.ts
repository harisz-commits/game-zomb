import './style.css';
import { App } from './game/App';
import { loadSaveWithTimeout } from './core/Services';
import { playables } from './systems/YouTubePlayablesAdapter';

/**
 * Entry point.
 *
 * No engine: a canvas, a WebGL stage and DOM for the interface. The Playables
 * lifecycle is unchanged - the SDK still gates the first frame, the save and
 * the score.
 */

// Any uncaught error is reported through the Playables health API.
window.addEventListener('error', (event) => playables.logError(event.error ?? event.message));
window.addEventListener('unhandledrejection', (event) => playables.logError(event.reason));

async function boot(): Promise<void> {
  playables.init();
  await loadSaveWithTimeout();

  const root = document.getElementById('game-root');
  if (!root) throw new Error('missing #game-root');
  const app = new App(root);
  app.start();

  document.getElementById('boot-splash')?.classList.add('hidden');
  window.setTimeout(() => document.getElementById('boot-splash')?.remove(), 400);

  if (import.meta.env.DEV) {
    (window as unknown as Record<string, unknown>).__LASTLINE_APP__ = app;
  }
}

void boot();
