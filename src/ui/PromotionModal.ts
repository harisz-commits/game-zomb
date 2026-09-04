import Phaser from 'phaser';
import { FONT_FAMILY } from '../config/GameConfig';
import { audio } from '../systems/AudioSystem';
import type { UpgradeDefinition } from '../types/game';
import { UpgradeCard } from './UpgradeCard';

/**
 * The promotion draft.
 *
 * Timing target from the design brief: everything except the player's own
 * decision fits in about a second - dim, title, cards in, pick, flash, tier
 * banner, back to the fight.
 */
export class PromotionModal {
  private readonly overlay: Phaser.GameObjects.Rectangle;
  private readonly title: Phaser.GameObjects.Text;
  private readonly subtitle: Phaser.GameObjects.Text;
  private readonly banner: Phaser.GameObjects.Text;
  private readonly flash: Phaser.GameObjects.Rectangle;
  private cards: UpgradeCard[] = [];

  private width = 720;
  private height = 1280;
  private onChoice: ((definition: UpgradeDefinition) => void) | null = null;

  isOpen = false;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly layer: Phaser.GameObjects.Layer,
  ) {
    this.overlay = scene.add
      .rectangle(0, 0, 10, 10, 0x05070c, 0.82)
      .setOrigin(0)
      .setVisible(false)
      .setDepth(200);

    this.title = scene.add
      .text(0, 0, 'PROMOTION', {
        fontFamily: FONT_FAMILY,
        fontSize: '44px',
        color: '#ffffff',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setVisible(false)
      .setDepth(202);

    this.subtitle = scene.add
      .text(0, 0, 'CHOOSE ONE UPGRADE', {
        fontFamily: FONT_FAMILY,
        fontSize: '16px',
        color: '#8a99b3',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setVisible(false)
      .setDepth(202);

    this.banner = scene.add
      .text(0, 0, '', {
        fontFamily: FONT_FAMILY,
        fontSize: '46px',
        color: '#7fd4a2',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setVisible(false)
      .setDepth(205);

    this.flash = scene.add
      .rectangle(0, 0, 10, 10, 0xffffff, 0)
      .setOrigin(0)
      .setVisible(false)
      .setDepth(204);

    this.layer.add([this.overlay, this.title, this.subtitle, this.banner, this.flash]);
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.overlay.setSize(width, height).setPosition(0, 0);
    this.flash.setSize(width, height).setPosition(0, 0);
    this.title.setPosition(width / 2, height * 0.18).setFontSize(Math.min(50, width * 0.11));
    this.subtitle.setPosition(width / 2, height * 0.18 + 40);
    this.banner.setPosition(width / 2, height * 0.42).setFontSize(Math.min(52, width * 0.12));
    if (this.isOpen) this.layoutCards();
  }

  open(
    choices: UpgradeDefinition[],
    onChoice: (definition: UpgradeDefinition) => void,
  ): void {
    this.isOpen = true;
    this.onChoice = onChoice;

    this.overlay.setVisible(true).setAlpha(0);
    this.scene.tweens.add({ targets: this.overlay, alpha: 0.82, duration: 140 });

    this.title.setVisible(true).setAlpha(0).setScale(0.7);
    this.subtitle.setVisible(true).setAlpha(0);
    this.scene.tweens.add({
      targets: this.title,
      alpha: 1,
      scale: 1,
      duration: 180,
      ease: 'Back.easeOut',
    });
    this.scene.tweens.add({ targets: this.subtitle, alpha: 1, duration: 200, delay: 80 });

    this.cards = choices.map(
      (definition) => new UpgradeCard(this.scene, definition, (card) => this.select(card)),
    );
    for (const card of this.cards) {
      card.setDepth(203);
      this.layer.add(card);
    }
    this.layoutCards();

    // Slide in from the bottom, staggered.
    this.cards.forEach((card, index) => {
      const targetY = card.y;
      card.y = targetY + 120;
      card.setAlpha(0);
      this.scene.tweens.add({
        targets: card,
        y: targetY,
        alpha: 1,
        duration: 220,
        delay: 60 + index * 55,
        ease: 'Back.easeOut',
      });
    });

    audio.play('promotion');
    if (choices.some((c) => c.rarity === 'LEGENDARY')) {
      this.scene.time.delayedCall(220, () => audio.play('legendary'));
    }
  }

  private layoutCards(): void {
    if (this.cards.length === 0) return;

    const gap = 12;
    const available = this.width - gap * (this.cards.length + 1);
    let cardWidth = Math.min(190, available / this.cards.length);
    const stacked = cardWidth < 104;

    if (stacked) {
      // Very narrow displays: one card per row, compact height.
      cardWidth = Math.min(300, this.width - 40);
      const cardHeight = Math.min(120, (this.height * 0.52) / this.cards.length - gap);
      const totalHeight = this.cards.length * (cardHeight + gap) - gap;
      const startY = this.height * 0.5 - totalHeight / 2;
      this.cards.forEach((card, index) => {
        card.resize(cardWidth, cardHeight);
        card.setPosition(this.width / 2, startY + index * (cardHeight + gap) + cardHeight / 2);
      });
      return;
    }

    const cardHeight = Math.min(280, this.height * 0.42);
    const totalWidth = this.cards.length * cardWidth + gap * (this.cards.length - 1);
    const startX = this.width / 2 - totalWidth / 2 + cardWidth / 2;
    const centerY = this.height * 0.52;

    this.cards.forEach((card, index) => {
      card.resize(cardWidth, cardHeight);
      card.setPosition(startX + index * (cardWidth + gap), centerY);
    });
  }

  private select(picked: UpgradeCard): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    audio.play('ui');

    for (const card of this.cards) {
      if (card === picked) card.playSelected();
      else card.playRejected();
    }

    this.scene.tweens.add({ targets: [this.title, this.subtitle], alpha: 0, duration: 140 });

    // Short white flash, then hand control back.
    this.scene.time.delayedCall(180, () => {
      this.flash.setVisible(true).setAlpha(0);
      this.scene.tweens.add({
        targets: this.flash,
        alpha: { from: 0.85, to: 0 },
        duration: 260,
        onComplete: () => this.flash.setVisible(false),
      });
      const choice = picked.definition;
      this.cleanup();
      this.onChoice?.(choice);
      this.onChoice = null;
    });
  }

  /** "VETERANS" banner shown right after the formation compresses. */
  showTierBanner(name: string): void {
    this.banner
      .setVisible(true)
      .setText(name)
      .setAlpha(0)
      .setScale(0.75)
      .setPosition(this.width / 2, this.height * 0.42);

    this.scene.tweens.add({
      targets: this.banner,
      alpha: 1,
      scale: 1,
      duration: 180,
      ease: 'Back.easeOut',
      onComplete: () => {
        this.scene.tweens.add({
          targets: this.banner,
          alpha: 0,
          scale: 1.1,
          delay: 420,
          duration: 240,
          onComplete: () => this.banner.setVisible(false),
        });
      },
    });
  }

  private cleanup(): void {
    this.scene.tweens.add({
      targets: this.overlay,
      alpha: 0,
      duration: 180,
      onComplete: () => this.overlay.setVisible(false),
    });
    this.scene.time.delayedCall(240, () => {
      for (const card of this.cards) card.destroy();
      this.cards = [];
      this.title.setVisible(false);
      this.subtitle.setVisible(false);
    });
  }

  destroy(): void {
    for (const card of this.cards) card.destroy();
    this.cards = [];
  }
}
