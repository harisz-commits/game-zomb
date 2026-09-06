import Phaser from 'phaser';
import { ARMY_BASE_Y, COLORS, WORLD_SCROLL_SPEED } from '../config/GameConfig';
import type { Viewport } from '../core/Viewport';

/** World spacing of the railing posts at the army line. */
const POST_SPACING = 96;
/** World spacing of the white lane markings. */
const MARKING_SPACING = 150;
const MARKING_LENGTH = 74;
/** World spacing of the deck's expansion joints. */
const SEAM_SPACING = 300;

/** Bands used to shade the deck from lit at the line to hazy up-field. */
const DECK_BANDS = 18;

/**
 * The bridge: a daylight highway span seen from behind the formation.
 *
 * Everything is built from the viewport's projection, so the deck, both truss
 * railings and the central barrier converge on the same vanishing point the
 * sprites are scaled against. That shared vanishing point is what makes a flat
 * 2D scene read as depth.
 *
 * All static geometry - sky, city, deck shading, lane washes, truss steel,
 * haze - is *baked into a render texture* whenever the canvas changes size,
 * and drawn as a single quad afterwards. That matters: Phaser re-tessellates
 * and re-fills a Graphics object every frame it is visible, so leaving a few
 * dozen screen-sized polygons in one costs a third of the frame rate. Only the
 * scrolling detail stays live.
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

    const px = (worldX: number, worldY: number) =>
      (v.projectX(worldX, worldY) - v.visibleLeft) * v.zoom;
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
    // Everything above this is "far": sky, city, haze.
    const horizon = py(ARMY_BASE_Y - 620);

    this.drawSky(g, w, h, horizon);
    this.drawCity(g, v, w, horizon);

    // The deck, shaded band by band: lit near the line, hazy up-field. The
    // lane washes are folded into the band colours so they cost no extra fill.
    const near = Phaser.Display.Color.IntegerToColor(COLORS.deckNear);
    const far = Phaser.Display.Color.IntegerToColor(COLORS.deckFar);
    for (let i = 0; i < DECK_BANDS; i++) {
      const y0 = top + ((bottom - top) * i) / DECK_BANDS;
      const y1 = top + ((bottom - top) * (i + 1)) / DECK_BANDS + 1 / v.zoom;
      const t = i / (DECK_BANDS - 1);
      const c = Phaser.Display.Color.Interpolate.ColorWithColor(far, near, 1, t);
      // Supply side reads a touch cooler, horde side a touch warmer.
      g.fillStyle(tint(c, 0.98, 1.0, 1.03), 1);
      quad(v.supplyLaneLeft, v.supplyLaneRight, y0, y1);
      g.fillStyle(tint(c, 1.02, 0.995, 0.98), 1);
      quad(v.combatLaneLeft, v.combatLaneRight, y0, y1);
    }

    // Kerbs along both edges and either side of the central barrier.
    g.fillStyle(COLORS.steelLit, 0.55);
    quad(v.fieldLeft + 6, v.fieldLeft + 16, top, bottom);
    quad(v.fieldRight - 16, v.fieldRight - 6, top, bottom);
    g.fillStyle(0x6d7684, 0.4);
    quad(v.dividerX - 26, v.dividerX - 20, top, bottom);
    quad(v.dividerX + 20, v.dividerX + 26, top, bottom);

    // The line the army holds, and the shaded apron behind it.
    g.fillStyle(0x7fd4a2, 0.3);
    quad(v.fieldLeft, v.fieldRight, ARMY_BASE_Y - 34, ARMY_BASE_Y - 27);
    g.fillStyle(0x5a6472, 0.14);
    quad(v.fieldLeft, v.fieldRight, ARMY_BASE_Y + 60, bottom);

    this.drawTruss(g, v, top, bottom);

    // Distance haze over everything on the deck.
    const hazeBottom = py(ARMY_BASE_Y - 90);
    const haze = Phaser.Display.Color.IntegerToColor(COLORS.haze);
    const hazeColor = Phaser.Display.Color.GetColor(haze.red, haze.green, haze.blue);
    const hazeSteps = 26;
    for (let i = 0; i < hazeSteps; i++) {
      const t = i / (hazeSteps - 1);
      g.fillStyle(hazeColor, (1 - t) * (1 - t) * 0.6);
      g.fillRect(0, (hazeBottom * i) / hazeSteps, w, hazeBottom / hazeSteps + 1);
    }

    // Edge vignette, baked in rather than drawn as a screen-space quad on top
    // of the finished frame - same look, no per-frame full-screen blend.
    const steps = 20;
    for (let i = 0; i < steps; i++) {
      const t = i / steps;
      const inset = (i * Math.min(w, h)) / (steps * 6);
      g.lineStyle(Math.max(2, Math.min(w, h) / (steps * 6)), 0x14304a, 0.055 * (1 - t) ** 1.5);
      g.strokeRect(inset, inset, w - inset * 2, h - inset * 2);
    }

    this.plate.clear();
    this.plate.draw(g);
    this.plate.setPosition(v.visibleLeft, v.visibleTop);
    this.plate.setDisplaySize(v.visibleRight - v.visibleLeft, v.visibleBottom - v.visibleTop);
    g.clear();
  }

  /** Bright sky, hazing out toward the horizon band. */
  private drawSky(
    g: Phaser.GameObjects.Graphics,
    w: number,
    h: number,
    horizon: number,
  ): void {
    const skyTop = Phaser.Display.Color.IntegerToColor(COLORS.skyTop);
    const skyLow = Phaser.Display.Color.IntegerToColor(COLORS.skyHorizon);
    const bands = 26;
    const skyBottom = Math.max(horizon, h * 0.35);
    for (let i = 0; i < bands; i++) {
      const t = i / (bands - 1);
      const c = Phaser.Display.Color.Interpolate.ColorWithColor(skyTop, skyLow, 1, t);
      g.fillStyle(Phaser.Display.Color.GetColor(c.r, c.g, c.b), 1);
      g.fillRect(0, (skyBottom * i) / bands, w, skyBottom / bands + 1);
    }
    // Below the horizon the sky is replaced by the deck, but the gutters on a
    // wide screen still need something: keep the horizon colour going down.
    g.fillStyle(COLORS.skyHorizon, 1);
    g.fillRect(0, skyBottom - 1, w, h - skyBottom + 2);
  }

  /**
   * The city the bridge runs into.
   *
   * Deterministic by design - a fixed hash rather than the run RNG - so a
   * resize rebuilds the exact same skyline instead of reshuffling the city
   * when the player turns their phone.
   */
  private drawCity(
    g: Phaser.GameObjects.Graphics,
    v: Viewport,
    w: number,
    horizon: number,
  ): void {
    let seed = 0x5eed;
    const rand = () => {
      seed ^= seed << 13;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      return ((seed >>> 0) % 10000) / 10000;
    };

    // Two ranks: a pale far rank, then a nearer, darker one.
    // Three ranks, back to front: each is darker and taller than the one
    // behind it, which is what reads as a city rather than a grey band.
    for (const rank of [0, 1, 2]) {
      const base = horizon + rank * 40;
      const alpha = [0.28, 0.45, 0.62][rank];
      const colour = [0x9ab4cc, 0x7593b2, COLORS.city][rank];
      const heightScale = [0.7, 0.95, 1.25][rank];
      let x = -40;
      let guard = 0;
      while (x < w + 40 && guard++ < 140) {
        const bw = 26 + rand() * 74;
        const bh = (70 + rand() * 240) * heightScale;
        g.fillStyle(colour, alpha);
        g.fillRect(x, base - bh, bw, bh);
        // Lit crown so the tower tops separate from the sky.
        g.fillStyle(0xd4e4f2, alpha * 0.4);
        g.fillRect(x, base - bh, bw, 3);
        if (rank >= 1 && bw > 34) {
          g.fillStyle(0x36506e, alpha * 0.45);
          for (let wy = base - bh + 12; wy < base - 10; wy += 18) {
            g.fillRect(x + 6, wy, bw - 12, 5);
          }
        }
        x += bw + 2 + rand() * 10;
      }
    }
    void v;
  }

  /**
   * Steel truss along both outer edges and down the middle of the bridge.
   *
   * The truss is the single most recognisable thing about the reference
   * silhouette, so it gets real structure: a bottom chord, a top chord and
   * diagonal web members, all converging with the road.
   */
  private drawTruss(
    g: Phaser.GameObjects.Graphics,
    v: Viewport,
    top: number,
    bottom: number,
  ): void {
    const quad = (xl: number, xr: number, yt: number, yb: number) => {
      g.fillPoints(
        [
          new Phaser.Geom.Point(v.projectX(xl, yt), yt),
          new Phaser.Geom.Point(v.projectX(xr, yt), yt),
          new Phaser.Geom.Point(v.projectX(xr, yb), yb),
          new Phaser.Geom.Point(v.projectX(xl, yb), yb),
        ],
        true,
      );
    };
    // Bake in *world* space here, then convert: the caller's px/py closure is
    // canvas space, and the truss is easier to reason about on the road.
    const toCanvas = (worldX: number, worldY: number): [number, number] => [
      (v.projectX(worldX, worldY) - v.visibleLeft) * v.zoom,
      (worldY - v.visibleTop) * v.zoom,
    ];
    void quad;

    for (const edge of [v.fieldLeft, v.fieldRight]) {
      const inward = edge === v.fieldLeft ? 1 : -1;

      // Bottom chord (the kerb wall) and top chord (the handrail).
      const chord = (offset: number, height: number, colour: number, alpha: number) => {
        g.fillStyle(colour, alpha);
        const pts: Phaser.Geom.Point[] = [];
        const steps = 12;
        for (let i = 0; i <= steps; i++) {
          const y = top + ((bottom - top) * i) / steps;
          const d = v.depthScale(y);
          const [cx, cy] = toCanvas(edge + inward * offset * d, y);
          pts.push(new Phaser.Geom.Point(cx, cy - height * d * v.zoom));
        }
        for (let i = steps; i >= 0; i--) {
          const y = top + ((bottom - top) * i) / steps;
          const d = v.depthScale(y);
          const [cx, cy] = toCanvas(edge + inward * offset * d, y);
          pts.push(new Phaser.Geom.Point(cx, cy - (height - 9) * d * v.zoom));
        }
        g.fillPoints(pts, true);
      };

      // Solid parapet, then the open truss above it.
      chord(6, 9, COLORS.steelDark, 0.95);
      chord(6, 34, COLORS.steel, 0.9);
      chord(6, 62, COLORS.steelLit, 0.8);
    }

    // Central barrier between the lanes: a low solid wall plus a rail.
    g.fillStyle(COLORS.steelDark, 0.95);
    const wall = (offset: number, height: number) => {
      const pts: Phaser.Geom.Point[] = [];
      const steps = 12;
      for (let i = 0; i <= steps; i++) {
        const y = top + ((bottom - top) * i) / steps;
        const d = v.depthScale(y);
        const [cx, cy] = toCanvas(v.dividerX + offset * d, y);
        pts.push(new Phaser.Geom.Point(cx, cy - height * d * v.zoom));
      }
      for (let i = steps; i >= 0; i--) {
        const y = top + ((bottom - top) * i) / steps;
        const d = v.depthScale(y);
        const [cx, cy] = toCanvas(v.dividerX - offset * d, y);
        pts.push(new Phaser.Geom.Point(cx, cy));
      }
      g.fillPoints(pts, true);
    };
    wall(15, 16);
    g.fillStyle(COLORS.steel, 0.95);
    wall(11, 30);
    g.fillStyle(COLORS.steelLit, 0.9);
    wall(7, 44);
  }

  /* ------------------------------------------------------------- moving -- */

  private drawMotion(v: Viewport): void {
    const g = this.motion;
    g.clear();

    const top = v.visibleTop - 30;
    const bottom = v.visibleBottom + 120;

    // Truss uprights. Spacing shrinks with distance, so they bunch up toward
    // the vanishing point the way real posts do.
    const postPhase = this.scroll % POST_SPACING;
    for (const edge of [v.fieldLeft, v.fieldRight]) {
      const inward = edge === v.fieldLeft ? 1 : -1;
      let y = bottom - postPhase;
      let guard = 0;
      while (y > top && guard++ < 70) {
        const d = v.depthScale(y);
        const x = v.projectX(edge + inward * 6 * d, y);
        g.fillStyle(COLORS.steelDark, 0.95);
        g.fillRect(x - 4 * d, y - 62 * d, 8 * d, 62 * d);
        g.fillStyle(COLORS.steelLit, 0.6);
        g.fillRect(x - 4 * d, y - 62 * d, 3 * d, 62 * d);
        y -= POST_SPACING * d;
      }
    }

    // Posts down the central barrier.
    const dividerPhase = this.scroll % (POST_SPACING * 1.4);
    let py2 = bottom - dividerPhase;
    let dividerGuard = 0;
    while (py2 > top && dividerGuard++ < 50) {
      const d = v.depthScale(py2);
      const x = v.projectX(v.dividerX, py2);
      g.fillStyle(COLORS.steelDark, 0.95);
      g.fillRect(x - 4 * d, py2 - 44 * d, 8 * d, 44 * d);
      py2 -= POST_SPACING * 1.4 * d;
    }

    // White lane markings down the middle of each lane.
    const markPhase = this.scroll % MARKING_SPACING;
    for (const laneCentre of [v.supplyLaneCenterX, v.combatLaneCenterX]) {
      let y = bottom - markPhase;
      let guard = 0;
      while (y > top && guard++ < 40) {
        const d = v.depthScale(y);
        const x = v.projectX(laneCentre, y);
        g.fillStyle(0xf0f0ea, 0.5);
        g.fillRect(x - 4 * d, y - MARKING_LENGTH * d, 8 * d, MARKING_LENGTH * d);
        y -= MARKING_SPACING * d;
      }
    }

    // Expansion joints across the deck - the main cue that the world moves.
    const seamPhase = this.scroll % SEAM_SPACING;
    let sy = bottom - seamPhase;
    let seamGuard = 0;
    while (sy > top && seamGuard++ < 26) {
      const d = v.depthScale(sy);
      const lx = v.projectX(v.fieldLeft, sy);
      const rx = v.projectX(v.fieldRight, sy);
      g.fillStyle(0x6a7078, 0.4);
      g.fillRect(lx, sy - 5 * d, rx - lx, 5 * d);
      g.fillStyle(0xd8dcd6, 0.25);
      g.fillRect(lx, sy - 8 * d, rx - lx, 3 * d);
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
