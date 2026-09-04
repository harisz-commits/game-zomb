import Phaser from 'phaser';
import { FONT_FAMILY } from '../config/GameConfig';
import type { RunStats } from '../types/game';
import { formatTime } from '../utils/MathUtils';
import { Button, PRIMARY_BUTTON, SECONDARY_BUTTON } from './Button';

export interface GameOverActions {
  onRetry: () => void;
  onMenu: () => void;
  onEndless?: () => void;
}

interface StatRow {
  label: Phaser.GameObjects.Text;
  value: Phaser.GameObjects.Text;
}

/**
 * End-of-run summary.
 *
 * Deliberately has no exit/quit control - Playables must never offer one.
 */
export class GameOverPanel {
  private readonly title: Phaser.GameObjects.Text;
  private readonly subtitle: Phaser.GameObjects.Text;
  private readonly scoreValue: Phaser.GameObjects.Text;
  private readonly scoreLabel: Phaser.GameObjects.Text;
  private readonly bestLabel: Phaser.GameObjects.Text;
  private readonly rows: StatRow[] = [];
  private readonly buttons: Button[] = [];

  constructor(
    private readonly scene: Phaser.Scene,
    stats: RunStats,
    bestScore: number,
    isNewBest: boolean,
    actions: GameOverActions,
  ) {
    const victory = stats.victory;

    this.title = scene.add
      .text(0, 0, victory ? 'VICTORY' : 'GAME OVER', {
        fontFamily: FONT_FAMILY,
        fontSize: '44px',
        color: victory ? '#7fd4a2' : '#ff8f8f',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    this.subtitle = scene.add
      .text(0, 0, victory ? 'THE LINE HELD' : `OVERRUN AS ${stats.tierName}`, {
        fontFamily: FONT_FAMILY,
        fontSize: '14px',
        color: '#8a99b3',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    this.scoreLabel = scene.add
      .text(0, 0, isNewBest ? 'NEW BEST SCORE' : 'SCORE', {
        fontFamily: FONT_FAMILY,
        fontSize: '13px',
        color: isNewBest ? '#ffc65c' : '#8a99b3',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    this.scoreValue = scene.add
      .text(0, 0, String(stats.score), {
        fontFamily: FONT_FAMILY,
        fontSize: '52px',
        color: '#ffc65c',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    this.bestLabel = scene.add
      .text(0, 0, `BEST ${bestScore}`, {
        fontFamily: FONT_FAMILY,
        fontSize: '13px',
        color: '#8a99b3',
      })
      .setOrigin(0.5);

    this.addRow('TIME SURVIVED', formatTime(stats.elapsed));
    this.addRow('ZOMBIES KILLED', String(stats.kills));
    this.addRow('PROMOTIONS', String(stats.promotions));
    this.addRow('MAX ARMY SIZE', String(stats.maxArmySize));

    this.buttons.push(new Button(scene, 'RETRY', PRIMARY_BUTTON, actions.onRetry));
    if (actions.onEndless) {
      this.buttons.push(new Button(scene, 'ENDLESS MODE', SECONDARY_BUTTON, actions.onEndless));
    }
    this.buttons.push(new Button(scene, 'MAIN MENU', SECONDARY_BUTTON, actions.onMenu));
  }

  private addRow(label: string, value: string): void {
    const labelText = this.scene.add
      .text(0, 0, label, { fontFamily: FONT_FAMILY, fontSize: '14px', color: '#8a99b3' })
      .setOrigin(0, 0.5);
    const valueText = this.scene.add
      .text(0, 0, value, {
        fontFamily: FONT_FAMILY,
        fontSize: '16px',
        color: '#f2f6ff',
        fontStyle: 'bold',
      })
      .setOrigin(1, 0.5);
    this.rows.push({ label: labelText, value: valueText });
  }

  resize(width: number, height: number): void {
    const centerX = width / 2;
    const contentWidth = Math.min(360, width - 48);
    const compact = height < 620;

    let y = compact ? height * 0.08 : height * 0.12;

    this.title.setPosition(centerX, y).setFontSize(Math.min(46, width * 0.11));
    y += compact ? 40 : 48;
    this.subtitle.setPosition(centerX, y);
    y += compact ? 30 : 40;

    this.scoreLabel.setPosition(centerX, y);
    y += compact ? 34 : 42;
    this.scoreValue.setPosition(centerX, y).setFontSize(Math.min(56, width * 0.14));
    y += compact ? 34 : 42;
    this.bestLabel.setPosition(centerX, y);
    y += compact ? 26 : 36;

    const rowGap = compact ? 26 : 32;
    for (const row of this.rows) {
      row.label.setPosition(centerX - contentWidth / 2, y);
      row.value.setPosition(centerX + contentWidth / 2, y);
      y += rowGap;
    }

    y += compact ? 12 : 22;
    const buttonWidth = contentWidth;
    const buttonHeight = compact ? 52 : 58;
    for (const button of this.buttons) {
      button.resize(buttonWidth, buttonHeight);
      button.setPosition(centerX, y + buttonHeight / 2);
      y += buttonHeight + 12;
    }
  }

}
