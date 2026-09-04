import Phaser from 'phaser';
import { FIELD_H, FIELD_W, SUPPLY_LANE_RATIO } from '../config/GameConfig';
import { clamp } from '../utils/MathUtils';

const MAX_ZOOM = 1.35;
/** How far the play field may widen on landscape/ultra-wide screens. */
const MAX_FIELD_WIDTH = FIELD_W * 2.2;

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

    if (widthAtHeightZoom >= FIELD_W) {
      // Landscape-ish: fit the height, widen the field with the spare width.
      this.zoom = Math.min(zoomByHeight, MAX_ZOOM);
      this.fieldWidth = clamp(this.canvasWidth / this.zoom, FIELD_W, MAX_FIELD_WIDTH);
    } else {
      // Very narrow portrait: fit the width, spare height becomes approach lane.
      this.zoom = Math.min(this.canvasWidth / FIELD_W, MAX_ZOOM);
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

  /** Applies the computed transform to a world camera. */
  applyTo(camera: Phaser.Cameras.Scene2D.Camera): void {
    camera.setZoom(this.zoom);
    camera.centerOn(this.centerX, (this.visibleTop + this.visibleBottom) / 2);
  }

  /** Converts a screen/pointer x into world x. */
  screenToWorldX(screenX: number): number {
    return this.visibleLeft + screenX / this.zoom;
  }

  /** Y just above the visible area - used for spawning without pop-in. */
  get spawnY(): number {
    return this.visibleTop - 60;
  }
}
