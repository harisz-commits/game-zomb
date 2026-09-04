import Phaser from 'phaser';
import { FAMILY_COLORS, FAMILY_ICONS, FONT_FAMILY, RARITY_COLORS } from '../config/GameConfig';
import type { UpgradeDefinition } from '../types/game';

/**
 * One draftable card. Purely presentational - it reports taps upward and knows
 * nothing about the upgrade system.
 */
export class UpgradeCard extends Phaser.GameObjects.Container {
  private readonly bg: Phaser.GameObjects.Graphics;
  private readonly glow: Phaser.GameObjects.Graphics;
  private readonly rarityText: Phaser.GameObjects.Text;
  private readonly nameText: Phaser.GameObjects.Text;
  private readonly descText: Phaser.GameObjects.Text;
  private readonly familyText: Phaser.GameObjects.Text;
  private readonly iconText: Phaser.GameObjects.Text;

  private glowTween?: Phaser.Tweens.Tween;

  constructor(
    scene: Phaser.Scene,
    public readonly definition: UpgradeDefinition,
    private readonly onPick: (card: UpgradeCard) => void,
  ) {
    super(scene, 0, 0);

    const rarityColor = RARITY_COLORS[definition.rarity] ?? 0xffffff;
    const familyColor = FAMILY_COLORS[definition.family] ?? 0xffffff;

    this.glow = scene.add.graphics();
    this.bg = scene.add.graphics();

    this.rarityText = scene.add
      .text(0, 0, definition.rarity, {
        fontFamily: FONT_FAMILY,
        fontSize: '13px',
        color: Phaser.Display.Color.IntegerToColor(rarityColor).rgba,
        fontStyle: 'bold',
      })
      .setOrigin(0.5, 0);

    this.iconText = scene.add
      .text(0, 0, FAMILY_ICONS[definition.family] ?? '◆', {
        fontFamily: FONT_FAMILY,
        fontSize: '38px',
        color: Phaser.Display.Color.IntegerToColor(familyColor).rgba,
      })
      .setOrigin(0.5, 0.5);

    this.nameText = scene.add
      .text(0, 0, definition.name, {
        fontFamily: FONT_FAMILY,
        fontSize: '16px',
        color: '#f2f6ff',
        fontStyle: 'bold',
        align: 'center',
        wordWrap: { width: 160 },
      })
      .setOrigin(0.5, 0);

    this.descText = scene.add
      .text(0, 0, definition.description, {
        fontFamily: FONT_FAMILY,
        fontSize: '13px',
        color: '#a9b8d0',
        align: 'center',
        wordWrap: { width: 160 },
        lineSpacing: 3,
      })
      .setOrigin(0.5, 0);

    this.familyText = scene.add
      .text(0, 0, definition.family, {
        fontFamily: FONT_FAMILY,
        fontSize: '11px',
        color: Phaser.Display.Color.IntegerToColor(familyColor).rgba,
        fontStyle: 'bold',
      })
      .setOrigin(0.5, 1);

    this.add([
      this.glow,
      this.bg,
      this.rarityText,
      this.iconText,
      this.nameText,
      this.descText,
      this.familyText,
    ]);
    scene.add.existing(this);
  }

  /** Lays the card out at a given size and wires up the hit area. */
  resize(width: number, height: number): void {
    const rarityColor = RARITY_COLORS[this.definition.rarity] ?? 0xffffff;
    const legendary = this.definition.rarity === 'LEGENDARY';
    const epic = this.definition.rarity === 'EPIC';

    const halfW = width / 2;
    const halfH = height / 2;

    this.bg.clear();
    this.bg.fillStyle(0x121926, 0.98);
    this.bg.fillRoundedRect(-halfW, -halfH, width, height, 14);
    this.bg.lineStyle(legendary ? 3 : epic ? 2.5 : 2, rarityColor, 1);
    this.bg.strokeRoundedRect(-halfW, -halfH, width, height, 14);
    // Rarity banner along the top edge.
    this.bg.fillStyle(rarityColor, 0.16);
    this.bg.fillRoundedRect(-halfW, -halfH, width, 30, { tl: 14, tr: 14, bl: 0, br: 0 });

    this.glow.clear();
    if (legendary || epic) {
      this.glow.lineStyle(legendary ? 10 : 7, rarityColor, legendary ? 0.28 : 0.18);
      this.glow.strokeRoundedRect(-halfW - 4, -halfH - 4, width + 8, height + 8, 18);
    }

    const wrap = Math.max(80, width - 22);
    this.rarityText.setPosition(0, -halfH + 8);
    this.iconText.setPosition(0, -halfH + 68).setFontSize(Math.min(40, width * 0.24));
    this.nameText
      .setPosition(0, -halfH + 100)
      .setFontSize(width < 130 ? 13 : 16)
      .setWordWrapWidth(wrap);
    this.descText
      .setPosition(0, -halfH + 100 + this.nameText.height + 10)
      .setFontSize(width < 130 ? 11 : 13)
      .setWordWrapWidth(wrap);
    this.familyText.setPosition(0, halfH - 10).setFontSize(width < 130 ? 10 : 11);

    this.setSize(width, height);
    // Phaser normalises the local point by adding displayOrigin before testing
    // the hit area, so the rectangle must be in top-left space (0,0,w,h) even
    // though the container itself is centre-origin. A centred rectangle here
    // shifts the touch target by half its size.
    this.setInteractive(
      new Phaser.Geom.Rectangle(0, 0, width, height),
      Phaser.Geom.Rectangle.Contains,
    );
    this.off(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN);
    this.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, () => this.onPick(this));

    if (legendary && !this.glowTween) {
      this.glowTween = this.scene.tweens.add({
        targets: this.glow,
        alpha: { from: 0.5, to: 1 },
        duration: 620,
        yoyo: true,
        repeat: -1,
      });
    }
  }

  /** Selection feedback: the picked card grows, the others fade away. */
  playSelected(): Phaser.Tweens.Tween {
    this.disableInteractive();
    return this.scene.tweens.add({
      targets: this,
      scale: 1.14,
      duration: 150,
      ease: 'Back.easeOut',
    });
  }

  playRejected(): void {
    this.disableInteractive();
    this.scene.tweens.add({
      targets: this,
      alpha: 0,
      scale: 0.9,
      duration: 140,
      ease: 'Quad.easeIn',
    });
  }

  override destroy(fromScene?: boolean): void {
    this.glowTween?.remove();
    this.glowTween = undefined;
    super.destroy(fromScene);
  }
}
