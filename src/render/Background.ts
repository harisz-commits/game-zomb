import Phaser from 'phaser';
import { ARMY_BASE_Y, COLORS, WORLD_SCROLL_SPEED } from '../config/GameConfig';
import type { Viewport } from '../core/Viewport';

/** World spacing of the railing posts at the army line. */
const POST_SPACING = 104;
/** World spacing of the divider dashes at the army line. */
const DASH_SPACING = 118;
const DASH_LENGTH = 58;
/** World spacing of the road seams at the army line. */
const SEAM_SPACING = 236;

/** Bands used to shade the deck from "lit" at the line to "hazy" up-field. */
const DECK_BANDS = 18;
const DECK_NEAR = 0x3b4553;
const DECK_FAR = 0x161d29;

/**
 * The bridge, drawn as a receding plane.
 *
 * Everything is built from the viewport's projection, so the two lanes, the
 * divider and both railings converge on the same vanishing point the sprites
 * are scaled against. That shared vanishing point is what makes a flat 2D
 * scene read as depth.
 *
 * All of that static geometry - sky, deck shading, lane washes, railings,
 * distance haze, edge vignette - is *baked into a render texture* whenever the
 * canvas changes size, and drawn as a single quad afterwards. That matters:
 * Phaser re-tessellates and re-fills a Graphics object every frame it is
 * visible, so leaving ~25 screen-sized polygons in one cost more than a third
 * of the frame rate on a software rasteriser. Only the scrolling detail -
 * posts, dashes, seams - stays live, and that is a few dozen small quads.
 */
export class Background {
  private readonly scene: Phaser.Scene;
  private readonly layer: Phaser.GameObjects.Layer;
  private readonly motion: Phaser.GameObjects.Graphics;
  /** Off-screen scratch used to bake the plate; never added to a layer. */
  private readonly scratch: Phaser.GameObjects.Graphics;

  private plate!: Phaser.GameObjects.RenderTexture;
  private viewport: Viewport | null = null;
  private scroll = 0;
  private plateWidth = 0;
  private plateHeight = 0;

  constructor(scene: Phaser.Scene, layer: Phaser.GameObjects.Layer) {
    this.scene = scene;
    this.layer = layer;
    const { width, height } = scene.scale.gameSize;
    this.ensurePlate(Math.max(2, Math.ceil(width)), Math.max(2, Math.ceil(height)));

    this.motion = scene.add.graphics().setDepth(-110);
    this.scratch = scene.make.graphics({ x: 0, y: 0 }, false);
    layer.add(this.motion);
  }

  /**
   * (Re)creates the plate at the canvas resolution.
   *
   * Deliberately not `RenderTexture.resize`: a DynamicTexture's render target
   * is created with autoResize off, so resize() updates the texture's reported
   * width while leaving the framebuffer at its original size - every row of the
   * bake then lands at the wrong stride and the whole background shears.
   * Recreating is exact, and only happens on an orientation change.
   */
  private ensurePlate(width: number, height: number): void {
    if (this.plate && width === this.plateWidth && height === this.plateHeight) return;
    this.plate?.destroy();
    this.plate = this.scene.add
      .renderTexture(0, 0, width, height)
      .setOrigin(0, 0)
      .setDepth(-130);
    this.layer.add(this.plate);
    this.plateWidth = width;
    this.plateHeight = height;
  }

  /** Advances and redraws the scrolling detail on the deck. */
  update(dt: number): void {
    this.scroll += WORLD_SCROLL_SPEED * dt;
    if (this.scroll > 1e6) this.scroll = 0;
    if (this.viewport) this.drawMotion(this.viewport);
  }

  redraw(viewport: Viewport): void {
    this.viewport = viewport;
    this.bakePlate(viewport);
    this.drawMotion(viewport);
  }

  destroy(): void {
    this.scratch.destroy();
  }

  /* --------------------------------------------------------------- baked -- */

  /**
   * Renders the static scene once, in canvas pixels, so the result is texel
   * exact when it is stretched back over the visible world rectangle.
   */
  private bakePlate(v: Viewport): void {
    const w = Math.max(2, Math.ceil(v.canvasWidth));
    const h = Math.max(2, Math.ceil(v.canvasHeight));
    this.ensurePlate(w, h);

    const g = this.scratch;
    g.clear();

    // Canvas-space helpers: the plate is drawn in pixels, then mapped back
    // onto the visible world rectangle 1:1.
    const px = (worldX: number, worldY: number) => (v.projectX(worldX, worldY) - v.visibleLeft) * v.zoom;
    const py = (worldY: number) => (worldY - v.visibleTop) * v.zoom;
    const quad = (xl: number, xr: number, yt: number, yb: number) => {
      g.fillPoints(
        [
          new Phaser.Geom.Point(px(xl, yt), py(yt)),
          new Phaser.Geom.Point(px(xr, yt), py(yt)),
          new Phaser.Geom.Point(px(xr, yb), py(yb)),
          new Phaser.Geom.Point(px(xl, yb), py(yb)),
        ],
        true,
      );
    };

    const top = v.visibleTop;
    const bottom = v.visibleBottom;

    // Sky / void either side of the bridge.
    const skyTop = Phaser.Display.Color.IntegerToColor(COLORS.bgTop);
    const skyBottom = Phaser.Display.Color.IntegerToColor(COLORS.bgBottom);
    for (let i = 0; i < 24; i++) {
      const t = i / 23;
      const c = Phaser.Display.Color.Interpolate.ColorWithColor(skyTop, skyBottom, 1, t);
      g.fillStyle(Phaser.Display.Color.GetColor(c.r, c.g, c.b), 1);
      g.fillRect(0, (h * i) / 24, w, h / 24 + 1);
    }

    // The deck, shaded band by band: lit at the line, hazy up-field. The lane
    // washes are folded into the band colours so they cost no extra fill.
    const near = Phaser.Display.Color.IntegerToColor(DECK_NEAR);
    const far = Phaser.Display.Color.IntegerToColor(DECK_FAR);
    for (let i = 0; i < DECK_BANDS; i++) {
      const y0 = top + ((bottom - top) * i) / DECK_BANDS;
      const y1 = top + ((bottom - top) * (i + 1)) / DECK_BANDS + 1 / v.zoom;
      const t = i / (DECK_BANDS - 1);
      const c = Phaser.Display.Color.Interpolate.ColorWithColor(far, near, 1, t);
      // Supply side reads cool, horde side reads hot - the lanes are the whole
      // decision, so they get their own light.
      g.fillStyle(tint(c, 0.94, 1.0, 1.14), 1);
      quad(v.supplyLaneLeft, v.supplyLaneRight, y0, y1);
      g.fillStyle(tint(c, 1.16, 0.96, 0.94), 1);
      quad(v.combatLaneLeft, v.combatLaneRight, y0, y1);
    }

    // Outer railings: dark kerb with a lit inner edge.
    for (const edge of [v.fieldLeft, v.fieldRight]) {
      const inner = edge === v.fieldLeft ? 9 : -9;
      g.fillStyle(0x11161f, 1);
      quad(edge - 14, edge + 14, top, bottom);
      g.fillStyle(0x515f74, 0.85);
      quad(edge + inner - 3, edge + inner + 3, top, bottom);
    }

    // Central divider - the line the whole game is played around.
    g.fillStyle(0x0e131c, 1);
    quad(v.dividerX - 13, v.dividerX + 13, top, bottom);
    g.fillStyle(0x39445a, 0.9);
    quad(v.dividerX - 13, v.dividerX - 9, top, bottom);
    quad(v.dividerX + 9, v.dividerX + 13, top, bottom);

    // The line the army holds, plus the darker apron behind it.
    g.fillStyle(COLORS.accentGreen, 0.16);
    quad(v.fieldLeft, v.fieldRight, ARMY_BASE_Y - 34, ARMY_BASE_Y - 28);
    g.fillStyle(0x080b12, 0.5);
    quad(v.fieldLeft, v.fieldRight, ARMY_BASE_Y + 46, bottom);

    // A city beside the bridge. Purely baked scenery: it fills the dark
    // wedges the converging road leaves at the top of the screen, which is
    // what turns "a road on black" into "a road going somewhere".
    this.drawSkyline(g, v, w, h);

    // Distance haze. The units carry their own haze tint (see
    // EnemySystem.applyHaze); this is the ground plane's share of it.
    const hazeBottom = py(ARMY_BASE_Y - 40);
    const hazeColor = Phaser.Display.Color.IntegerToColor(COLORS.bgTop);
    const hazeSteps = 28;
    for (let i = 0; i < hazeSteps; i++) {
      const t = i / (hazeSteps - 1);
      g.fillStyle(
        Phaser.Display.Color.GetColor(hazeColor.red, hazeColor.green, hazeColor.blue),
        (1 - t) * (1 - t) * 0.82,
      );
      g.fillRect(0, (hazeBottom * i) / hazeSteps, w, hazeBottom / hazeSteps + 1);
    }

    // Edge vignette, baked in rather than drawn as a screen-space quad on top
    // of the finished frame - same look, no per-frame full-screen blend.
    const steps = 22;
    for (let i = 0; i < steps; i++) {
      const t = i / steps;
      const inset = (i * Math.min(w, h)) / (steps * 5);
      g.lineStyle(Math.max(2, Math.min(w, h) / (steps * 5)), 0x000000, 0.07 * (1 - t) ** 1.5);
      g.strokeRect(inset, inset, w - inset * 2, h - inset * 2);
    }

    this.plate.clear();
    this.plate.draw(g);
    this.plate.setPosition(v.visibleLeft, v.visibleTop);
    this.plate.setDisplaySize(v.visibleRight - v.visibleLeft, v.visibleBottom - v.visibleTop);
    g.clear();
  }

  /**
   * Building silhouettes in the void either side of the bridge.
   *
   * Deterministic by design - a fixed hash rather than the run RNG - so a
   * resize rebuilds the exact same skyline instead of reshuffling the city
   * when the player turns their phone.
   */
  private drawSkyline(
    g: Phaser.GameObjects.Graphics,
    v: Viewport,
    w: number,
    h: number,
  ): void {
    const horizonBand = (ARMY_BASE_Y - 120 - v.visibleTop) * v.zoom;
    let seed = 0x5eed;
    const rand = () => {
      // xorshift: stable, no allocation, no dependency on the run's RNG.
      seed ^= seed << 13;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      return ((seed >>> 0) % 10000) / 10000;
    };

    for (const side of [-1, 1] as const) {
      const edge = side < 0 ? v.fieldLeft : v.fieldRight;
      let y = -20;
      let guard = 0;
      while (y < horizonBand && guard++ < 90) {
        const worldY = v.visibleTop + y / v.zoom;
        const edgeX = (v.projectX(edge, worldY) - v.visibleLeft) * v.zoom;
        const depth = 1 - y / Math.max(1, horizonBand);

        const bw = (14 + rand() * 34) * (0.5 + 0.5 * (1 - depth));
        const bh = (26 + rand() * 92) * (0.45 + 0.55 * (1 - depth));
        const gap = 6 + rand() * 26;
        const x = side < 0 ? edgeX - bw - 6 : edgeX + 6;

        if (x + bw > 0 && x < w) {
          const shade = 0.05 + rand() * 0.05 + depth * 0.05;
          g.fillStyle(0x8fa6c4, shade);
          g.fillRect(x, y, bw, bh);
          g.fillStyle(0x0a0e16, 0.35);
          g.fillRect(x, y, bw, 2);
          // A couple of lit windows so the block is not a flat slab.
          const windows = 1 + Math.floor(rand() * 3);
          for (let k = 0; k < windows; k++) {
            g.fillStyle(0xffc46a, 0.16 + rand() * 0.16);
            g.fillRect(x + 3 + rand() * Math.max(1, bw - 8), y + 6 + rand() * Math.max(1, bh - 12), 3, 2);
          }
        }
        y += bh * 0.42 + gap;
      }
    }
    void h;
  }

  /* ------------------------------------------------------------- moving -- */

  private drawMotion(v: Viewport): void {
    const g = this.motion;
    g.clear();

    const top = v.visibleTop - 30;
    const bottom = v.visibleBottom + 120;

    // Railing posts. Spacing shrinks with distance, so they bunch up toward
    // the vanishing point the way real posts do.
    const postPhase = this.scroll % POST_SPACING;
    for (const edge of [v.fieldLeft, v.fieldRight]) {
      let y = bottom - postPhase;
      let guard = 0;
      while (y > top && guard++ < 64) {
        const d = v.depthScale(y);
        const x = v.projectX(edge, y);
        const pw = 15 * d;
        const ph = 26 * d;
        g.fillStyle(0x5c6b82, 0.9);
        g.fillRect(x - pw / 2, y - ph, pw, ph);
        g.fillStyle(0x9fb2cc, 0.55);
        g.fillRect(x - pw / 2, y - ph, pw, 3 * d);
        y -= POST_SPACING * d;
      }
    }

    // Divider dashes.
    const dashPhase = this.scroll % DASH_SPACING;
    let dy = bottom - dashPhase;
    let dashGuard = 0;
    while (dy > top && dashGuard++ < 48) {
      const d = v.depthScale(dy);
      const x = v.projectX(v.dividerX, dy);
      g.fillStyle(0xd7b45a, 0.45);
      g.fillRect(x - 3 * d, dy - DASH_LENGTH * d, 6 * d, DASH_LENGTH * d);
      dy -= DASH_SPACING * d;
    }

    // Expansion seams across the deck - the main cue that the world moves.
    const seamPhase = this.scroll % SEAM_SPACING;
    let sy = bottom - seamPhase;
    let seamGuard = 0;
    while (sy > top && seamGuard++ < 32) {
      const d = v.depthScale(sy);
      const lx = v.projectX(v.fieldLeft, sy);
      const rx = v.projectX(v.fieldRight, sy);
      g.fillStyle(0x0a0e15, 0.45);
      g.fillRect(lx, sy - 4 * d, rx - lx, 4 * d);
      g.fillStyle(0x7d8ca3, 0.14);
      g.fillRect(lx, sy - 6 * d, rx - lx, 2 * d);
      sy -= SEAM_SPACING * d;
    }
  }
}

/** Per-channel multiply on an interpolated colour, clamped to a byte. */
function tint(
  c: { r: number; g: number; b: number },
  rm: number,
  gm: number,
  bm: number,
): number {
  const clampByte = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v | 0);
  return Phaser.Display.Color.GetColor(clampByte(c.r * rm), clampByte(c.g * gm), clampByte(c.b * bm));
}
