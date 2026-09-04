import Phaser from 'phaser';
import { COLORS } from './config/GameConfig';
import { BattleScene } from './scenes/BattleScene';
import { BootScene } from './scenes/BootScene';
import { GameOverScene } from './scenes/GameOverScene';
import { MenuScene } from './scenes/MenuScene';
import { playables } from './systems/YouTubePlayablesAdapter';

/**
 * Entry point.
 *
 * Notes for the Playables target:
 *  - `Phaser.AUTO` picks WebGL and falls back to Canvas automatically.
 *  - `Scale.RESIZE` keeps the canvas exactly at viewport size; the virtual
 *    field is mapped by a camera (see `Viewport`), so orientation changes
 *    never restart a run.
 *  - Phaser's own audio subsystem is disabled - all sound is procedural
 *    WebAudio routed through `AudioSystem`, which respects the host's audio
 *    state.
 */
const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game-root',
  backgroundColor: COLORS.bgBottom,
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: '100%',
    height: '100%',
    // Sensible bounds so extreme viewports still produce a usable layout.
    min: { width: 240, height: 320 },
    max: { width: 2560, height: 2560 },
  },
  render: {
    antialias: true,
    powerPreference: 'high-performance',
    roundPixels: false,
    transparent: false,
  },
  fps: { target: 60, min: 30, forceSetTimeOut: false },
  audio: { noAudio: true },
  disableContextMenu: true,
  banner: false,
  scene: [BootScene, MenuScene, BattleScene, GameOverScene],
};

// Any uncaught error is reported through the Playables health API.
window.addEventListener('error', (event) => {
  playables.logError(event.error ?? event.message);
});
window.addEventListener('unhandledrejection', (event) => {
  playables.logError(event.reason);
});

export const game = new Phaser.Game(config);

if (import.meta.env.DEV) {
  // Dev-only handle for automated smoke tests. Stripped from production builds.
  (window as unknown as Record<string, unknown>).__LASTLINE_GAME__ = game;
}
