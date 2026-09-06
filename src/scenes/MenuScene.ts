import Phaser from 'phaser';
import { COLORS, FONT_FAMILY, GAME_SUBTITLE, GAME_TITLE } from '../config/GameConfig';
import { save } from '../core/Services';
import { TEX } from '../render/TextureFactory';
import { audio } from '../systems/AudioSystem';
import { playables } from '../systems/YouTubePlayablesAdapter';
import { Button, PRIMARY_BUTTON, SECONDARY_BUTTON } from '../ui/Button';
import type { GameMode } from '../types/game';

/**
 * Main menu. Also the point where the game declares itself interactive
 * (`gameReady`) and where the audio context is unlocked by the first tap.
 */
export class MenuScene extends Phaser.Scene {
  private title!: Phaser.GameObjects.Text;
  private subtitle!: Phaser.GameObjects.Text;
  private bestText!: Phaser.GameObjects.Text;
  private hintText!: Phaser.GameObjects.Text;
  private playButton!: Button;
  private endlessButton!: Button;
  private audioButton!: Button;
  private decor: Phaser.GameObjects.Image[] = [];

  constructor() {
    super('Menu');
  }

  create(): void {
    this.cameras.main.setBackgroundColor(COLORS.bgBottom);

    this.title = this.add
      .text(0, 0, GAME_TITLE, {
        fontFamily: FONT_FAMILY,
        fontSize: '58px',
        color: '#f2f6ff',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    this.subtitle = this.add
      .text(0, 0, GAME_SUBTITLE, {
        fontFamily: FONT_FAMILY,
        fontSize: '14px',
        color: '#8a99b3',
        fontStyle: 'bold',
        align: 'center',
      })
      .setOrigin(0.5);

    const data = save.current;
    this.bestText = this.add
      .text(0, 0, data.bestScore > 0 ? `BEST ${data.bestScore}` : '', {
        fontFamily: FONT_FAMILY,
        fontSize: '15px',
        color: '#ffc65c',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    this.hintText = this.add
      .text(0, 0, 'DRAG TO MOVE YOUR ARMY', {
        fontFamily: FONT_FAMILY,
        fontSize: '13px',
        color: '#5f6c82',
        align: 'center',
      })
      .setOrigin(0.5);

    this.playButton = new Button(this, 'PLAY', PRIMARY_BUTTON, () => this.startRun('CAMPAIGN'));
    this.endlessButton = new Button(this, 'ENDLESS MODE', SECONDARY_BUTTON, () =>
      this.startRun('ENDLESS'),
    );
    this.audioButton = new Button(this, this.audioLabel(), SECONDARY_BUTTON, () =>
      this.toggleAudio(),
    );

    if (!data.endlessUnlocked) {
      this.endlessButton.setAlpha(0.45);
      this.endlessButton.setText('ENDLESS (PLAY ONCE)');
    }

    // A tiny squad of soldiers as decoration - reuses the generated textures.
    for (let i = 0; i < 7; i++) {
      this.decor.push(this.add.image(0, 0, TEX.soldier(Math.min(5, Math.floor(i / 2)), Math.min(5, Math.floor(i / 2)))));
    }

    this.scale.on(Phaser.Scale.Events.RESIZE, this.layout, this);
    this.layout();

    // Unlock the WebAudio context on the very first user interaction.
    this.input.once(Phaser.Input.Events.POINTER_DOWN, () => {
      audio.unlock();
      audio.setMusicEnabled(save.current.settings.musicEnabled);
      audio.setSfxEnabled(save.current.settings.sfxEnabled);
    });

    // The menu is interactive - this is the correct moment for gameReady().
    playables.gameReady();

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.layout, this);
    });
  }

  private audioLabel(): string {
    const settings = save.current.settings;
    if (settings.musicEnabled && settings.sfxEnabled) return 'AUDIO: ON';
    if (!settings.musicEnabled && !settings.sfxEnabled) return 'AUDIO: OFF';
    return 'AUDIO: SFX ONLY';
  }

  private toggleAudio(): void {
    save.update((data) => {
      const settings = data.settings;
      if (settings.musicEnabled && settings.sfxEnabled) {
        settings.musicEnabled = false;
      } else if (!settings.musicEnabled && settings.sfxEnabled) {
        settings.sfxEnabled = false;
      } else {
        settings.musicEnabled = true;
        settings.sfxEnabled = true;
      }
    });
    audio.setMusicEnabled(save.current.settings.musicEnabled);
    audio.setSfxEnabled(save.current.settings.sfxEnabled);
    this.audioButton.setText(this.audioLabel());
  }

  private startRun(mode: GameMode): void {
    if (mode === 'ENDLESS' && !save.current.endlessUnlocked) return;
    audio.unlock();
    this.scene.start('Battle', { mode });
  }

  private layout(): void {
    const { width, height } = this.scale.gameSize;
    const centerX = width / 2;
    const compact = height < 620;

    this.title
      .setPosition(centerX, height * (compact ? 0.14 : 0.2))
      .setFontSize(Math.min(64, width * 0.15));
    this.subtitle
      .setPosition(centerX, height * (compact ? 0.14 : 0.2) + (compact ? 34 : 46))
      .setWordWrapWidth(width * 0.8);
    this.bestText.setPosition(centerX, height * (compact ? 0.14 : 0.2) + (compact ? 58 : 74));

    const spacing = 24;
    this.decor.forEach((sprite, index) => {
      sprite
        .setPosition(centerX + (index - 3) * spacing, height * (compact ? 0.42 : 0.46))
        .setScale(compact ? 1.4 : 1.8);
    });

    const buttonWidth = Math.min(300, width - 56);
    const buttonHeight = compact ? 52 : 58;
    let y = height * (compact ? 0.6 : 0.62);

    for (const button of [this.playButton, this.endlessButton, this.audioButton]) {
      button.resize(buttonWidth, buttonHeight);
      button.setPosition(centerX, y);
      y += buttonHeight + 14;
    }

    this.hintText.setPosition(centerX, Math.min(y + 16, height - 22)).setWordWrapWidth(width * 0.8);
  }
}
