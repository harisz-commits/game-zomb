import {
  DEPTH_ANCHOR_Y,
  FIELD_H,
  FIELD_W,
  FIELD_WIDTH_RATIO,
  FOG_MAX,
  FOG_START_Y,
  HORIZON_Y,
  MIN_DEPTH_SCALE,
  SUPPLY_LANE_RATIO,
} from '../config/GameConfig';
import { clamp } from '../utils/MathUtils';

const MAX_ZOOM = 1.35;
/** How far the play field may widen on landscape/ultra-wide screens. */
const MAX_FIELD_WIDTH = FIELD_W * 2.2;
/**
 * Visible width the field is sized against. The bridge deliberately does not
 * reach the edges of the screen - see FIELD_WIDTH_RATIO.
 */
const TARGET_VISIBLE_W = FIELD_W / FIELD_WIDTH_RATIO;

/**
 * Maps the fixed virtual play field onto any canvas size.
 *
 * Rules:
 *  - The full field height is always visible (no cropping of the approach lane).
 *  - Extra vertical space is added at the *top*, so the army keeps the same
 *    distance to the bottom edge on every device.
 *  - Extra horizontal space widens the playable field (up to a cap) instead of
 *    letterboxing, which makes landscape and ultra-wide feel deliberate.
 *  - Resizing only recomputes these numbers; it never touches simulation state,
 *    so a run survives orientation changes.
 */
export class Viewport {
  zoom = 1;
  canvasWidth = FIELD_W;
  canvasHeight = FIELD_H;

  /** Playable horizontal bounds in world units. */
  fieldLeft = 0;
  fieldRight = FIELD_W;
  fieldWidth = FIELD_W;

  /** Visible world rectangle (may be larger than the field). */
  visibleLeft = 0;
  visibleRight = FIELD_W;
  visibleTop = 0;
  visibleBottom = FIELD_H;

  centerX = FIELD_W / 2;

  /** World x of the divider between the supply lane and the combat lane. */
  dividerX = FIELD_W * SUPPLY_LANE_RATIO;
  supplyLaneLeft = 0;
  supplyLaneRight = FIELD_W * SUPPLY_LANE_RATIO;
  combatLaneLeft = FIELD_W * SUPPLY_LANE_RATIO;
  combatLaneRight = FIELD_W;

  get supplyLaneWidth(): number {
    return this.supplyLaneRight - this.supplyLaneLeft;
  }

  get combatLaneWidth(): number {
    return this.combatLaneRight - this.combatLaneLeft;
  }

  get supplyLaneCenterX(): number {
    return (this.supplyLaneLeft + this.supplyLaneRight) / 2;
  }

  get combatLaneCenterX(): number {
    return (this.combatLaneLeft + this.combatLaneRight) / 2;
  }

  /** True when a world x sits in the supply (left) lane. */
  isSupplyLane(x: number): boolean {
    return x < this.dividerX;
  }

  update(width: number, height: number): void {
    this.canvasWidth = Math.max(1, width);
    this.canvasHeight = Math.max(1, height);

    const zoomByHeight = this.canvasHeight / FIELD_H;
    const widthAtHeightZoom = this.canvasWidth / zoomByHeight;

    if (widthAtHeightZoom >= TARGET_VISIBLE_W) {
      // Landscape-ish: fit the height, widen the field with the spare width -
      // still keeping the sky margin down both sides.
      this.zoom = Math.min(zoomByHeight, MAX_ZOOM);
      this.fieldWidth = clamp(
        (this.canvasWidth / this.zoom) * FIELD_WIDTH_RATIO,
        FIELD_W,
        MAX_FIELD_WIDTH,
      );
    } else {
      // Portrait: fit the bridge plus its margins to the width; spare height
      // becomes approach lane at the top.
      this.zoom = Math.min(this.canvasWidth / TARGET_VISIBLE_W, MAX_ZOOM);
      this.fieldWidth = FIELD_W;
    }

    const visibleW = this.canvasWidth / this.zoom;
    const visibleH = this.canvasHeight / this.zoom;

    this.centerX = FIELD_W / 2;
    this.fieldLeft = this.centerX - this.fieldWidth / 2;
    this.fieldRight = this.centerX + this.fieldWidth / 2;

    this.dividerX = this.fieldLeft + this.fieldWidth * SUPPLY_LANE_RATIO;
    this.supplyLaneLeft = this.fieldLeft;
    this.supplyLaneRight = this.dividerX;
    this.combatLaneLeft = this.dividerX;
    this.combatLaneRight = this.fieldRight;

    this.visibleLeft = this.centerX - visibleW / 2;
    this.visibleRight = this.centerX + visibleW / 2;
    this.visibleBottom = FIELD_H;
    this.visibleTop = FIELD_H - visibleH;
  }

  /** Converts a screen/pointer x into world x. */
  screenToWorldX(screenX: number): number {
    return this.visibleLeft + screenX / this.zoom;
  }

  /** Y just above the visible area - used for spawning without pop-in. */
  get spawnY(): number {
    return this.visibleTop - 60;
  }

  /* ---------------------------------------------------------- perspective -- */

  /**
   * How large a thing standing on world row `y` is drawn.
   *
   * 1 at the army's front line, shrinking toward the vanishing point. The
   * rows *behind* the front line (the back of the formation) come out above 1,
   * which is correct: they are the closest thing to the camera.
   */
  depthScale(y: number): number {
    const scale = (y - HORIZON_Y) / (DEPTH_ANCHOR_Y - HORIZON_Y);
    return scale < MIN_DEPTH_SCALE ? MIN_DEPTH_SCALE : scale;
  }

  /**
   * Screen x for a world point. World y is deliberately left alone - see the
   * perspective note in GameConfig.
   */
  projectX(x: number, y: number): number {
    return this.centerX + (x - this.centerX) * this.depthScale(y);
  }

  /** Inverse of `projectX` on a given row. */
  unprojectX(screenX: number, y: number): number {
    return this.centerX + (screenX - this.centerX) / this.depthScale(y);
  }

  /**
   * Distance haze. Everything far up the bridge fades into the background,
   * which is what stops the shrunken sprites from reading as "small" rather
   * than "far away".
   */
  fogAlpha(y: number): number {
    const start = DEPTH_ANCHOR_Y - FOG_START_Y;
    if (y >= start) return 0;
    const span = start - this.visibleTop + 220;
    const t = (start - y) / (span > 1 ? span : 1);
    const eased = t * t;
    return eased > 1 ? FOG_MAX : eased * FOG_MAX;
  }
}
