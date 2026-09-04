import Phaser from 'phaser';
import { ARMY_BASE_Y, COLORS, WORLD_SCROLL_SPEED } from '../config/GameConfig';
import type { Viewport } from '../core/Viewport';
import { TEX } from './TextureFactory';

/**
 * The bridge.
 *
 * Two lanes split by a central divider: the supply lane on the left, the
 * combat lane on the right. The deck is a scrolling TileSprite, which is what
 * sells "the army is advancing" while the formation actually holds position at
 * the bottom of the screen.
 */
export class Background {
  private readonly sky: Phaser.GameObjects.Image;
  private readonly deck: Phaser.GameObjects.TileSprite;
  private readonly structure: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene, layer: Phaser.GameObjects.Layer) {
    this.sky = scene.add.image(0, 0, TEX.sky).setOrigin(0, 0).setDepth(-120);
    this.deck = scene.add
      .tileSprite(0, 0, 10, 10, TEX.road)
      .setOrigin(0, 0)
      .setDepth(-110);
    this.structure = scene.add.graphics().setDepth(-100);

    layer.add(this.sky);
    layer.add(this.deck);
    layer.add(this.structure);
  }

  /** Advances the deck so the world reads as moving toward the player. */
  update(dt: number): void {
    this.deck.tilePositionY -= WORLD_SCROLL_SPEED * dt;
  }

  redraw(viewport: Viewport): void {
    const left = viewport.visibleLeft - 200;
    const right = viewport.visibleRight + 200;
    const top = viewport.visibleTop - 200;
    const bottom = viewport.visibleBottom + 200;
    const width = right - left;
    const height = bottom - top;

    // One stretched gradient quad instead of a stack of banded fills.
    this.sky.setPosition(left, top).setDisplaySize(width, height);

    // The deck is the one thing redrawn every frame, so it covers exactly the
    // visible field and not a pixel more - it is pure fill rate otherwise.
    this.deck
      .setPosition(viewport.fieldLeft, viewport.visibleTop)
      .setSize(viewport.fieldWidth, viewport.visibleBottom - viewport.visibleTop)
      .setTileScale(1, 1);

    // --- railings, divider, lane markings ---------------------------------
    const s = this.structure;
    s.clear();

    // Outer railings.
    for (const x of [viewport.fieldLeft, viewport.fieldRight]) {
      s.fillStyle(0x1a212c, 1);
      s.fillRect(x - 7, top, 14, height);
      s.fillStyle(0x4a5566, 1);
      s.fillRect(x - 7, top, 3, height);
      s.lineStyle(2, 0x59657a, 0.7);
      s.strokeRect(x - 7, top, 14, height);
    }

    // Central divider - the line the whole game is played around.
    const d = viewport.dividerX;
    s.fillStyle(0x161c26, 1);
    s.fillRect(d - 9, top, 18, height);
    s.fillStyle(0x3d4757, 1);
    s.fillRect(d - 9, top, 4, height);
    s.fillRect(d + 5, top, 4, height);
    s.lineStyle(2, 0x66748c, 0.55);
    s.strokeRect(d - 9, top, 18, height);

    // The line the army holds.
    s.lineStyle(3, COLORS.accentGreen, 0.32);
    s.lineBetween(viewport.fieldLeft, ARMY_BASE_Y - 30, viewport.fieldRight, ARMY_BASE_Y - 30);
    s.fillStyle(COLORS.ground, 0.5);
    s.fillRect(
      viewport.fieldLeft,
      ARMY_BASE_Y + 40,
      viewport.fieldWidth,
      bottom - (ARMY_BASE_Y + 40),
    );

    // Gutters beyond the field so wide screens never show bare background.
    if (viewport.visibleLeft < viewport.fieldLeft - 1) {
      s.fillStyle(0x05070c, 0.5);
      s.fillRect(left, top, viewport.fieldLeft - left, height);
      s.fillRect(viewport.fieldRight, top, right - viewport.fieldRight, height);
    }
  }
}
