import Phaser from 'phaser';
import { FONT_FAMILY } from '../config/GameConfig';
import { audio } from '../systems/AudioSystem';

export interface ButtonStyle {
  fill: number;
  border: number;
  text: string;
  height?: number;
  fontSize?: number;
}

export const PRIMARY_BUTTON: ButtonStyle = {
  fill: 0x1f6f4a,
  border: 0x7fd4a2,
  text: '#eafff3',
};

export const SECONDARY_BUTTON: ButtonStyle = {
  fill: 0x161d29,
  border: 0x2f3c52,
  text: '#c6d2e6',
};

/**
 * Touch-first button.
 *
 * Minimum height is 52px so every control clears the recommended touch target
 * size on phones, which the Playables review explicitly looks for.
 */
export class Button extends Phaser.GameObjects.Container {
  private readonly bg: Phaser.GameObjects.Graphics;
  private readonly label: Phaser.GameObjects.Text;
  private buttonHeight = 56;

  constructor(
    scene: Phaser.Scene,
    text: string,
    private readonly style: ButtonStyle,
    private readonly onClick: () => void,
  ) {
    super(scene, 0, 0);
    this.bg = scene.add.graphics();
    this.label = scene.add
      .text(0, 0, text, {
        fontFamily: FONT_FAMILY,
        fontSize: `${style.fontSize ?? 19}px`,
        color: style.text,
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
    this.add([this.bg, this.label]);
    scene.add.existing(this);
  }

  resize(width: number, height = 56): void {
    this.buttonHeight = Math.max(52, height);

    const halfW = width / 2;
    const halfH = this.buttonHeight / 2;
    this.bg.clear();
    this.bg.fillStyle(this.style.fill, 1);
    this.bg.fillRoundedRect(-halfW, -halfH, width, this.buttonHeight, 12);
    this.bg.lineStyle(2, this.style.border, 1);
    this.bg.strokeRoundedRect(-halfW, -halfH, width, this.buttonHeight, 12);

    this.setSize(width, this.buttonHeight);
    // Phaser normalises the local point by adding displayOrigin before testing
    // the hit area, so the rectangle must be in top-left space (0,0,w,h) even
    // though the container itself is centre-origin. A centred rectangle here
    // shifts the touch target by half its size.
    this.setInteractive(
      new Phaser.Geom.Rectangle(0, 0, width, this.buttonHeight),
      Phaser.Geom.Rectangle.Contains,
    );
    this.off(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN);
    this.off(Phaser.Input.Events.GAMEOBJECT_POINTER_UP);
    this.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, () => {
      this.setScale(0.96);
    });
    this.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => {
      this.setScale(1);
      audio.play('ui');
      this.onClick();
    });
  }

  setText(text: string): void {
    this.label.setText(text);
  }

}
