import Phaser from 'phaser';
import { GAME_TITLE } from '../config/GameConfig';
import { loadSaveWithTimeout } from '../core/Services';
import { generateTextures } from '../render/TextureFactory';
import { audio } from '../systems/AudioSystem';
import { playables } from '../systems/YouTubePlayablesAdapter';

/**
 * Boot: generate every placeholder texture, wire the Playables adapter, load
 * the save, then hand over to the menu.
 *
 * There are no network loads at all, so "time to interactive" is essentially
 * texture generation plus one (timeout-guarded) cloud save read.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create(): void {
    playables.init();
    audio.init();

    generateTextures(this);

    // The first frame is on screen after the first render pass.
    this.game.events.once(Phaser.Core.Events.POST_RENDER, () => {
      playables.firstFrameReady();
      this.hideSplash();
    });

    document.title = GAME_TITLE;

    void loadSaveWithTimeout().then(() => {
      this.scene.start('Menu');
    });
  }

  private hideSplash(): void {
    const splash = document.getElementById('boot-splash');
    if (!splash) return;
    splash.classList.add('hidden');
    window.setTimeout(() => splash.remove(), 400);
  }
}
