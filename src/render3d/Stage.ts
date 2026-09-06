import * as THREE from 'three';
import { ARMY_BASE_Y, COLORS, FIELD_H, FIELD_W } from '../config/GameConfig';

/**
 * Game world -> 3D scene mapping.
 *
 * The simulation keeps its 2D coordinates: x across the bridge, y up the
 * bridge with larger values nearer the player. Nothing in the gameplay code
 * had to change for the move to 3D - this is the only place that knows the
 * scene is three-dimensional at all.
 *
 *   world x  ->  scene x, centred on the bridge
 *   world y  ->  scene z, with the firing line at z = 0
 *   scene y  ->  height above the deck, which the simulation has no concept of
 */
export const WORLD_TO_SCENE = 0.1;

/** Scene x for a world x. */
export function sceneX(worldX: number): number {
  return (worldX - FIELD_W / 2) * WORLD_TO_SCENE;
}

/** Scene z for a world y. Larger world y is nearer the camera. */
export function sceneZ(worldY: number): number {
  return (worldY - ARMY_BASE_Y) * WORLD_TO_SCENE;
}

export function worldXFromScene(x: number): number {
  return x / WORLD_TO_SCENE + FIELD_W / 2;
}

export interface StageQuality {
  shadows: boolean;
  shadowMapSize: number;
  pixelRatio: number;
}

/**
 * Owns the renderer, camera and lights.
 *
 * The camera is placed to reproduce the reference framing that the 2D build
 * was measured against: the deck filling ~0.875 of the width at the firing
 * line, the firing line itself ~0.73 of the way down the screen. Those are
 * checked by `measure()` rather than trusted.
 */
/** Framing targets, measured from the reference footage. */
const TARGET_DECK_AT_LINE = 0.875;
const TARGET_LINE_ON_SCREEN = 0.73;
/** How far below the horizontal the camera looks. */
const CAMERA_PITCH = 0.38;

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

export class Stage {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;

  private readonly sun: THREE.DirectionalLight;
  private readonly raycaster = new THREE.Raycaster();
  private readonly groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private readonly pointer = new THREE.Vector2();
  private readonly hit = new THREE.Vector3();

  private width = 1;
  private height = 1;
  private maxPixelRatio = 2;
  private camDistance = 90;
  private camLookZ = -40;
  /** Camera height with no shake applied; the view shakes around it. */
  homeY = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene.background = new THREE.Color(COLORS.skyHorizon);
    // Distance haze. In 3D this is one line instead of a baked gradient, and
    // it is applied per fragment, so it works on every object automatically.
    this.scene.fog = new THREE.Fog(COLORS.skyHorizon, 60, 230);

    this.camera = new THREE.PerspectiveCamera(34, 1, 1, 400);

    this.sun = new THREE.DirectionalLight(0xfff2dc, 2.4);
    this.sun.position.set(38, 62, 26);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    this.sun.shadow.camera.near = 10;
    this.sun.shadow.camera.far = 190;
    // Shadow frustum covers the near half of the bridge - the only part where
    // a shadow is large enough on screen to be worth the fill.
    const extent = 62;
    this.sun.shadow.camera.left = -extent;
    this.sun.shadow.camera.right = extent;
    this.sun.shadow.camera.top = extent;
    this.sun.shadow.camera.bottom = -extent;
    this.sun.shadow.bias = -0.0016;
    this.sun.target.position.set(0, 0, -30);
    this.scene.add(this.sun, this.sun.target);
    this.scene.add(new THREE.HemisphereLight(0xdcf0ff, 0x74796f, 1.25));

    this.fitCamera();
  }

  resize(width: number, height: number): void {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.renderer.setPixelRatio(Math.min(this.maxPixelRatio, window.devicePixelRatio || 1));
    this.renderer.setSize(this.width, this.height, false);
    this.camera.aspect = this.width / this.height;

    // Portrait phones are much taller than the design aspect; widening the
    // vertical FOV there keeps the same amount of bridge in frame instead of
    // cropping the approach lane.
    const aspect = this.camera.aspect;
    this.camera.fov = aspect < 0.62 ? 40 : aspect < 0.9 ? 36 : 30;
    this.camera.updateProjectionMatrix();
    this.fitCamera();
  }

  /**
   * Places the camera so the frame matches the reference footage.
   *
   * Two numbers were measured off that footage - the deck fills 0.875 of the
   * width at the firing line, and the firing line sits 0.73 of the way down
   * the screen - and two camera parameters control them: how far back it sits,
   * and how far up the bridge it looks. Rather than deriving the closed form
   * for every aspect ratio and FOV, this solves for them numerically. It runs
   * on resize, converges in a handful of iterations, and means the framing is
   * *checked* rather than assumed on every device it lands on.
   */
  private fitCamera(): void {
    for (let i = 0; i < 30; i++) {
      this.placeCamera();
      const m = this.measure();
      if (!Number.isFinite(m.deckAtLine) || m.deckAtLine <= 0) break;
      const deckError = m.deckAtLine / TARGET_DECK_AT_LINE;
      this.camDistance = clamp(this.camDistance * deckError, 30, 400);
      this.camLookZ += (m.lineAtScreen - TARGET_LINE_ON_SCREEN) * this.camDistance * 0.9;
      this.camLookZ = clamp(this.camLookZ, -260, 40);
      if (Math.abs(deckError - 1) < 0.002 && Math.abs(m.lineAtScreen - TARGET_LINE_ON_SCREEN) < 0.002) {
        break;
      }
    }
    this.placeCamera();

    // Fog and the shadow frustum are expressed relative to how far the camera
    // ended up: the fit moves it a long way on a narrow phone, and a fixed
    // range would either swallow the whole bridge or never reach it.
    const fog = this.scene.fog as THREE.Fog;
    fog.near = this.camDistance * 0.55;
    fog.far = this.camDistance * 2.9;
    this.camera.far = this.camDistance * 3.4;
    this.camera.updateProjectionMatrix();

    this.sun.target.position.set(0, 0, this.camLookZ);
    this.sun.position.set(this.camDistance * 0.4, this.camDistance * 0.7, this.camLookZ + 40);
    this.sun.target.updateMatrixWorld();
    const extent = this.camDistance * 0.75;
    this.sun.shadow.camera.left = -extent;
    this.sun.shadow.camera.right = extent;
    this.sun.shadow.camera.top = extent;
    this.sun.shadow.camera.bottom = -extent;
    this.sun.shadow.camera.far = this.camDistance * 2.4;
    this.sun.shadow.camera.updateProjectionMatrix();
  }

  /** How far back the fit put the camera - drives fog, shadows and the deck. */
  get cameraDistance(): number {
    return this.camDistance;
  }

  private placeCamera(): void {
    const target = new THREE.Vector3(0, 2, this.camLookZ);
    this.camera.position.set(
      0,
      target.y + Math.sin(CAMERA_PITCH) * this.camDistance,
      target.z + Math.cos(CAMERA_PITCH) * this.camDistance,
    );
    this.camera.lookAt(target);
    this.camera.updateMatrixWorld();
    this.homeY = this.camera.position.y;
  }

  applyQuality(quality: StageQuality): void {
    this.maxPixelRatio = quality.pixelRatio;
    this.renderer.shadowMap.enabled = quality.shadows;
    if (this.sun.shadow.mapSize.width !== quality.shadowMapSize) {
      this.sun.shadow.mapSize.set(quality.shadowMapSize, quality.shadowMapSize);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
    this.renderer.setPixelRatio(Math.min(this.maxPixelRatio, window.devicePixelRatio || 1));
    this.renderer.setSize(this.width, this.height, false);
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  /**
   * Where a screen point lands on the deck, as a world x.
   *
   * A ray against the ground plane rather than an inverse projection: the
   * camera is free to move without this needing to know how.
   */
  worldXAtScreen(screenX: number, screenY: number): number {
    this.pointer.set((screenX / this.width) * 2 - 1, -(screenY / this.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    if (!this.raycaster.ray.intersectPlane(this.groundPlane, this.hit)) return FIELD_W / 2;
    return worldXFromScene(this.hit.x);
  }

  /** Projects a scene point to canvas pixels - used to pin HTML labels. */
  project(x: number, y: number, z: number, out: { x: number; y: number }): boolean {
    const v = new THREE.Vector3(x, y, z).project(this.camera);
    out.x = (v.x * 0.5 + 0.5) * this.width;
    out.y = (-v.y * 0.5 + 0.5) * this.height;
    return v.z < 1;
  }

  /**
   * The framing numbers the reference was measured against, read back off the
   * live camera so a change here is checked rather than assumed.
   */
  measure(): {
    deckAtLine: number;
    deckAtTop: number;
    lineAtScreen: number;
  } {
    const out = { x: 0, y: 0 };
    const half = sceneX(FIELD_W) - sceneX(FIELD_W / 2);
    this.project(-half, 0, 0, out);
    const leftAtLine = out.x;
    this.project(half, 0, 0, out);
    const rightAtLine = out.x;
    this.project(0, 0, 0, out);
    const lineY = out.y;
    const farZ = sceneZ(-FIELD_H * 0.4);
    this.project(-half, 0, farZ, out);
    const leftFar = out.x;
    this.project(half, 0, farZ, out);
    const rightFar = out.x;
    return {
      deckAtLine: (rightAtLine - leftAtLine) / this.width,
      deckAtTop: (rightFar - leftFar) / this.width,
      lineAtScreen: lineY / this.height,
    };
  }
}
