import Phaser from 'phaser';
import { COLORS } from '../config/GameConfig';
import { save } from '../core/Services';
import { audio } from '../systems/AudioSystem';
import type { GameMode, RunStats } from '../types/game';
import { GameOverPanel } from '../ui/GameOverPanel';

interface GameOverData {
  stats: RunStats;
  bestScore: number;
  isNewBest: boolean;
}

/** End-of-run screen. Retry, Endless, Main Menu - never a quit button. */
export class GameOverScene extends Phaser.Scene {
  private panel!: GameOverPanel;
  private runData!: GameOverData;

  constructor() {
    super('GameOver');
  }

  init(data: GameOverData): void {
    this.runData = data;
  }

  create(): void {
    this.cameras.main.setBackgroundColor(COLORS.bgBottom);

    const mode: GameMode = this.runData.stats.mode;

    this.panel = new GameOverPanel(
      this,
      this.runData.stats,
      this.runData.bestScore,
      this.runData.isNewBest,
      {
        onRetry: () => this.scene.start('Battle', { mode }),
        onMenu: () => this.scene.start('Menu'),
        onEndless: save.current.endlessUnlocked
          ? () => this.scene.start('Battle', { mode: 'ENDLESS' })
          : undefined,
      },
    );

    this.scale.on(Phaser.Scale.Events.RESIZE, this.layout, this);
    this.layout();

    if (this.runData.isNewBest) audio.play('legendary', 0.7);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.layout, this);
    });
  }

  private layout(): void {
    const { width, height } = this.scale.gameSize;
    this.panel.resize(width, height);
  }
}
