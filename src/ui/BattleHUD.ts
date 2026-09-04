import Phaser from 'phaser';
import { BALANCE } from '../config/BalanceConfig';
import { FAMILY_COLORS, FONT_FAMILY } from '../config/GameConfig';
import type { BattleContext } from '../core/BattleContext';
import { GameEvent } from '../core/EventBus';
import { UPGRADE_FAMILIES } from '../types/game';
import { formatCompact, formatTime } from '../utils/MathUtils';

const PAD = 16;

/**
 * In-battle HUD. Deliberately sparse: army size + tier on the left, time in
 * the middle, score on the right, one promotion progress bar. Everything else
 * is transient feedback.
 *
 * Lives in the UI layer which is rendered by an unzoomed camera, so all
 * coordinates here are screen pixels.
 */
export class BattleHUD {
  private readonly armyText: Phaser.GameObjects.Text;
  private readonly tierText: Phaser.GameObjects.Text;
  private readonly timerText: Phaser.GameObjects.Text;
  private readonly phaseText: Phaser.GameObjects.Text;
  private readonly scoreText: Phaser.GameObjects.Text;
  private readonly promoText: Phaser.GameObjects.Text;
  private readonly promoBarBg: Phaser.GameObjects.Rectangle;
  private readonly promoBarFill: Phaser.GameObjects.Rectangle;
  private readonly doctrineText: Phaser.GameObjects.Text;
  private readonly hintText: Phaser.GameObjects.Text;
  private readonly bannerText: Phaser.GameObjects.Text;

  private readonly bossBarBg: Phaser.GameObjects.Rectangle;
  private readonly bossBarFill: Phaser.GameObjects.Rectangle;
  private readonly bossNameText: Phaser.GameObjects.Text;

  private hintTimer = 0;
  private bannerTimer = 0;
  private lastArmyCount = -1;

  constructor(private readonly ctx: BattleContext) {
    const scene = ctx.scene;
    const layer = ctx.uiLayer;

    this.armyText = scene.add
      .text(0, 0, '0', { fontFamily: FONT_FAMILY, fontSize: '38px', color: '#ffffff', fontStyle: 'bold' })
      .setOrigin(0, 0);

    this.tierText = scene.add
      .text(0, 0, 'SOLDIERS', {
        fontFamily: FONT_FAMILY,
        fontSize: '14px',
        color: '#7fd4a2',
        fontStyle: 'bold',
      })
      .setOrigin(0, 0);

    this.timerText = scene.add
      .text(0, 0, '0:00', { fontFamily: FONT_FAMILY, fontSize: '24px', color: '#f2f6ff', fontStyle: 'bold' })
      .setOrigin(0.5, 0);

    this.phaseText = scene.add
      .text(0, 0, '', { fontFamily: FONT_FAMILY, fontSize: '12px', color: '#8a99b3', fontStyle: 'bold' })
      .setOrigin(0.5, 0);

    this.scoreText = scene.add
      .text(0, 0, '0', { fontFamily: FONT_FAMILY, fontSize: '24px', color: '#ffc65c', fontStyle: 'bold' })
      .setOrigin(1, 0);

    this.promoBarBg = scene.add.rectangle(0, 0, 130, 6, 0x1c2434).setOrigin(0, 0);
    this.promoBarFill = scene.add.rectangle(0, 0, 0, 6, 0x7fd4a2).setOrigin(0, 0);
    this.promoText = scene.add
      .text(0, 0, '', { fontFamily: FONT_FAMILY, fontSize: '12px', color: '#8a99b3' })
      .setOrigin(0, 0);

    this.doctrineText = scene.add
      .text(0, 0, '', { fontFamily: FONT_FAMILY, fontSize: '12px', color: '#8a99b3', fontStyle: 'bold' })
      .setOrigin(1, 0);

    this.bossBarBg = scene.add.rectangle(0, 0, 200, 9, 0x2a1620).setOrigin(0.5, 0).setVisible(false);
    this.bossBarFill = scene.add
      .rectangle(0, 0, 200, 9, 0xff5a5a)
      .setOrigin(0, 0)
      .setVisible(false);
    this.bossNameText = scene.add
      .text(0, 0, '', { fontFamily: FONT_FAMILY, fontSize: '13px', color: '#ff8f8f', fontStyle: 'bold' })
      .setOrigin(0.5, 1)
      .setVisible(false);

    this.hintText = scene.add
      .text(0, 0, '', {
        fontFamily: FONT_FAMILY,
        fontSize: '18px',
        color: '#e8eef7',
        fontStyle: 'bold',
        align: 'center',
      })
      .setOrigin(0.5)
      .setAlpha(0);

    this.bannerText = scene.add
      .text(0, 0, '', {
        fontFamily: FONT_FAMILY,
        fontSize: '26px',
        color: '#ffc65c',
        fontStyle: 'bold',
        align: 'center',
      })
      .setOrigin(0.5)
      .setAlpha(0);

    layer.add([
      this.armyText,
      this.tierText,
      this.timerText,
      this.phaseText,
      this.scoreText,
      this.promoBarBg,
      this.promoBarFill,
      this.promoText,
      this.doctrineText,
      this.bossBarBg,
      this.bossBarFill,
      this.bossNameText,
      this.hintText,
      this.bannerText,
    ]);

    this.bindEvents();
  }

  private bindEvents(): void {
    const events = this.ctx.events;
    events.on(GameEvent.TUTORIAL_HINT, ({ text, duration }) => this.showHint(text, duration));
    events.on(GameEvent.PHASE_CHANGED, ({ label }) => this.showBanner(label, '#ffc65c'));
    events.on(GameEvent.ENDLESS_MODIFIER, ({ label }) => this.showBanner(label, '#ff8a4c'));
    events.on(GameEvent.DOCTRINE_UNLOCKED, ({ name, level, family }) => {
      const color = Phaser.Display.Color.IntegerToColor(FAMILY_COLORS[family] ?? 0xffffff).rgba;
      this.showBanner(level > 1 ? `${name}  ${'I'.repeat(level)}` : name, color);
    });
    events.on(GameEvent.BOSS_SPAWNED, ({ name }) => this.showBanner(name, '#ff5a5a'));
  }

  resize(width: number, height: number): void {
    const top = PAD;
    this.armyText.setPosition(PAD, top);
    this.tierText.setPosition(PAD + 2, top + 40);

    this.promoBarBg.setPosition(PAD + 2, top + 60).setSize(Math.min(150, width * 0.34), 6);
    this.promoBarFill.setPosition(PAD + 2, top + 60).setSize(0, 6);
    this.promoText.setPosition(PAD + 2, top + 68);

    this.timerText.setPosition(width / 2, top + 2).setFontSize(width < 380 ? 20 : 24);
    this.phaseText.setPosition(width / 2, top + 30);

    this.scoreText.setPosition(width - PAD, top + 2).setFontSize(width < 380 ? 20 : 24);
    this.doctrineText.setPosition(width - PAD, top + 30).setWordWrapWidth(width * 0.34);

    const bossWidth = Math.min(width - PAD * 4, 420);
    this.bossBarBg.setPosition(width / 2, top + 54).setSize(bossWidth, 9);
    this.bossBarFill.setPosition(width / 2 - bossWidth / 2, top + 54).setSize(bossWidth, 9);
    this.bossNameText.setPosition(width / 2, top + 52);

    this.hintText
      .setPosition(width / 2, height * 0.42)
      .setWordWrapWidth(width * 0.8)
      .setFontSize(width < 380 ? 16 : 18);
    this.bannerText
      .setPosition(width / 2, height * 0.3)
      .setWordWrapWidth(width * 0.9)
      .setFontSize(width < 380 ? 22 : 26);
  }

  update(dt: number): void {
    const ctx = this.ctx;
    const army = ctx.army;

    if (army.count !== this.lastArmyCount) {
      this.lastArmyCount = army.count;
      this.armyText.setText(String(army.count));
      this.tierText.setText(army.currentTier.name);
      // Small pop so growth is felt, not just read.
      this.armyText.setScale(1.12);
      ctx.scene.tweens.add({ targets: this.armyText, scale: 1, duration: 150, ease: 'Quad.easeOut' });
    }

    const threshold = ctx.promotion.getThreshold(ctx.upgrades.modifiers);
    const ratio = Phaser.Math.Clamp(army.count / threshold, 0, 1);
    this.promoBarFill.width = this.promoBarBg.width * ratio;
    this.promoText.setText(`${army.count} / ${threshold}`);

    const elapsed = ctx.runtime.elapsed;
    if (ctx.runtime.mode === 'CAMPAIGN') {
      const remaining = Math.max(0, BALANCE.RUN_DURATION - elapsed);
      this.timerText.setText(formatTime(remaining));
    } else {
      this.timerText.setText(formatTime(elapsed));
    }
    this.phaseText.setText(ctx.director.phase.label);

    this.scoreText.setText(formatCompact(ctx.score.score));
    this.updateDoctrines();
    this.updateBossBar();

    if (this.hintTimer > 0) {
      this.hintTimer -= dt;
      if (this.hintTimer <= 0) {
        ctx.scene.tweens.add({ targets: this.hintText, alpha: 0, duration: 220 });
      }
    }
    if (this.bannerTimer > 0) {
      this.bannerTimer -= dt;
      if (this.bannerTimer <= 0) {
        ctx.scene.tweens.add({ targets: this.bannerText, alpha: 0, duration: 250 });
      }
    }
  }

  private updateDoctrines(): void {
    const levels = this.ctx.upgrades.modifiers.doctrineLevels;
    let label = '';
    for (const family of UPGRADE_FAMILIES) {
      const level = levels[family];
      if (level > 0) label += `${family.slice(0, 3)}${level > 1 ? '·II' : ''}  `;
    }
    if (this.doctrineText.text !== label) this.doctrineText.setText(label.trim());
  }

  private updateBossBar(): void {
    const boss = this.ctx.enemies.currentBoss;
    if (!boss || !boss.active) {
      if (this.bossBarBg.visible) {
        this.bossBarBg.setVisible(false);
        this.bossBarFill.setVisible(false);
        this.bossNameText.setVisible(false);
      }
      return;
    }
    if (!this.bossBarBg.visible) {
      this.bossBarBg.setVisible(true);
      this.bossBarFill.setVisible(true);
      this.bossNameText.setVisible(true).setText(boss.def.name);
    }
    this.bossBarFill.width = this.bossBarBg.width * Phaser.Math.Clamp(boss.hpRatio, 0, 1);
  }

  showHint(text: string, duration: number): void {
    this.hintText.setText(text).setAlpha(0);
    this.ctx.scene.tweens.add({ targets: this.hintText, alpha: 1, duration: 220 });
    this.hintTimer = duration;
  }

  showBanner(text: string, color: string): void {
    this.bannerText.setText(text).setColor(color).setAlpha(0).setScale(0.8);
    this.ctx.scene.tweens.add({
      targets: this.bannerText,
      alpha: 1,
      scale: 1,
      duration: 220,
      ease: 'Back.easeOut',
    });
    this.bannerTimer = 1.6;
  }

  setVisible(visible: boolean): void {
    for (const item of [
      this.armyText,
      this.tierText,
      this.timerText,
      this.phaseText,
      this.scoreText,
      this.promoBarBg,
      this.promoBarFill,
      this.promoText,
      this.doctrineText,
    ]) {
      item.setVisible(visible);
    }
  }
}
