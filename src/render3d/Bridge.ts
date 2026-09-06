import * as THREE from 'three';
import { ARMY_BASE_Y, COLORS, FIELD_W, SUPPLY_LANE_RATIO, WORLD_SCROLL_SPEED } from '../config/GameConfig';
import { WORLD_TO_SCENE, sceneX } from './Stage';
import { mergeBoxes, modelMaterial, shade } from './BoxModel';

const DECK_HALF = (FIELD_W / 2) * WORLD_TO_SCENE;
const DIVIDER_X = sceneX(FIELD_W * SUPPLY_LANE_RATIO);
/** How far up-bridge the deck is built. Beyond this the fog has closed in. */
const DECK_AHEAD = 420;
const DECK_BEHIND = 60;
const POST_SPACING = 9;
const MARK_SPACING = 16;

/**
 * The bridge: deck, kerbs, steel railings, lane markings and the city either
 * side of it.
 *
 * Everything that does not move is one static mesh; the two things that do -
 * the railing posts and the lane markings - are InstancedMeshes whose
 * instances are recycled as they pass the camera, so the world scrolls
 * without allocating anything.
 */
export class Bridge {
  private readonly group = new THREE.Group();
  private readonly posts: THREE.InstancedMesh;
  private readonly marks: THREE.InstancedMesh;
  private readonly postZ: number[] = [];
  private readonly markZ: number[] = [];
  private readonly markX: number[] = [];
  private readonly dummy = new THREE.Object3D();
  private readonly matrix = new THREE.Matrix4();

  constructor(scene: THREE.Scene) {
    scene.add(this.group);

    // --- deck, kerbs, divider: one merged static mesh ---------------------
    const supplyMid = (-DECK_HALF + DIVIDER_X) / 2;
    const combatMid = (DIVIDER_X + DECK_HALF) / 2;
    const length = DECK_AHEAD + DECK_BEHIND;
    const midZ = (DECK_BEHIND - DECK_AHEAD) / 2;

    const deck = mergeBoxes([
      // Slab, split so each lane can carry its own light.
      {
        p: [supplyMid, -1, midZ],
        s: [DIVIDER_X + DECK_HALF, 2, length],
        c: shade(COLORS.deckNear, 0.98),
      },
      {
        p: [combatMid, -1, midZ],
        s: [DECK_HALF - DIVIDER_X, 2, length],
        c: shade(COLORS.deckNear, 1.02),
      },
      // Kerbs
      { p: [-DECK_HALF + 1.4, 0.15, midZ], s: [1.4, 0.3, length], c: COLORS.steelLit },
      { p: [DECK_HALF - 1.4, 0.15, midZ], s: [1.4, 0.3, length], c: COLORS.steelLit },
      // The line the army holds.
      { p: [0, 0.06, -3.4], s: [DECK_HALF * 2, 0.12, 0.6], c: 0x7fd4a2 },
      // Central barrier
      { p: [DIVIDER_X, 0.8, midZ], s: [1.6, 1.6, length], c: COLORS.steelDark },
      { p: [DIVIDER_X, 1.75, midZ], s: [2.4, 0.4, length], c: COLORS.steelLit },
      // Outer parapets
      { p: [-DECK_HALF, 1.3, midZ], s: [1.6, 2.6, length], c: COLORS.steel },
      { p: [DECK_HALF, 1.3, midZ], s: [1.6, 2.6, length], c: COLORS.steel },
      { p: [-DECK_HALF, 5.4, midZ], s: [2.2, 0.6, length], c: COLORS.steelLit },
      { p: [DECK_HALF, 5.4, midZ], s: [2.2, 0.6, length], c: COLORS.steelLit },
    ]);
    const deckMesh = new THREE.Mesh(deck, modelMaterial());
    deckMesh.receiveShadow = true;
    this.group.add(deckMesh);

    // --- railing posts ----------------------------------------------------
    const postGeo = mergeBoxes([
      { p: [0, 2.7, 0], s: [1.7, 5.4, 1.7], c: COLORS.steelDark },
      { p: [0, 5.3, 0], s: [2.1, 0.5, 2.1], c: COLORS.steelLit },
    ]);
    const perSide = Math.ceil((DECK_AHEAD + DECK_BEHIND) / POST_SPACING);
    this.posts = new THREE.InstancedMesh(postGeo, modelMaterial(), perSide * 2);
    this.posts.castShadow = true;
    this.posts.frustumCulled = false;
    this.posts.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < perSide; i++) {
      this.postZ.push(DECK_BEHIND - i * POST_SPACING);
      this.postZ.push(DECK_BEHIND - i * POST_SPACING);
    }
    this.group.add(this.posts);

    // --- lane markings ----------------------------------------------------
    const markGeo = mergeBoxes([{ p: [0, 0, 0], s: [0.9, 0.1, 7], c: 0xf0f0ea }]);
    const marksPerLane = Math.ceil((DECK_AHEAD + DECK_BEHIND) / MARK_SPACING);
    this.marks = new THREE.InstancedMesh(markGeo, modelMaterial(), marksPerLane * 2);
    this.marks.frustumCulled = false;
    this.marks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < marksPerLane; i++) {
      this.markZ.push(DECK_BEHIND - i * MARK_SPACING);
      this.markX.push(supplyMid);
      this.markZ.push(DECK_BEHIND - i * MARK_SPACING);
      this.markX.push(combatMid);
    }
    this.group.add(this.marks);

    this.buildCity();
    this.update(0);
  }

  /**
   * City blocks either side of and below the span, so the bridge reads as
   * elevated. Deterministic: the same skyline every run.
   */
  private buildCity(): void {
    let seed = 0x5eed;
    const rand = () => {
      seed ^= seed << 13;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      return ((seed >>> 0) % 10000) / 10000;
    };
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshLambertMaterial({ color: COLORS.city, flatShading: true });
    const count = 260;
    const city = new THREE.InstancedMesh(geo, material, count);
    city.receiveShadow = false;
    const dummy = new THREE.Object3D();
    const colour = new THREE.Color();
    let i = 0;
    for (let ring = 0; ring < 3; ring++) {
      for (let z = 40; z > -DECK_AHEAD - 40 && i < count; z -= 12 + rand() * 26) {
        for (const side of [-1, 1]) {
          if (i >= count) break;
          const h = 12 + rand() * (46 + ring * 26);
          const w = 7 + rand() * 15;
          dummy.position.set(
            side * (DECK_HALF + 16 + ring * 26 + rand() * 16),
            h / 2 - 24,
            z,
          );
          dummy.rotation.set(0, 0, 0);
          dummy.scale.set(w, h, w);
          dummy.updateMatrix();
          city.setMatrixAt(i, dummy.matrix);
          const tone = 0.78 + rand() * 0.45 - ring * 0.08;
          colour.setRGB(tone, tone, tone * 1.05);
          city.setColorAt(i, colour);
          i++;
        }
      }
    }
    city.count = i;
    this.group.add(city);
  }

  /** Scrolls the moving detail. `dt` is seconds of game time. */
  update(dt: number): void {
    const step = WORLD_SCROLL_SPEED * WORLD_TO_SCENE * dt;
    const wrap = DECK_BEHIND + DECK_AHEAD;

    for (let i = 0; i < this.postZ.length; i++) {
      let z = this.postZ[i] + step;
      if (z > DECK_BEHIND) z -= wrap;
      this.postZ[i] = z;
      const side = i % 2 === 0 ? -DECK_HALF : DECK_HALF;
      this.dummy.position.set(side, 0, z);
      this.dummy.rotation.set(0, 0, 0);
      this.dummy.scale.setScalar(1);
      this.dummy.updateMatrix();
      this.posts.setMatrixAt(i, this.dummy.matrix);
    }
    this.posts.instanceMatrix.needsUpdate = true;

    for (let i = 0; i < this.markZ.length; i++) {
      let z = this.markZ[i] + step;
      if (z > DECK_BEHIND) z -= wrap;
      this.markZ[i] = z;
      this.matrix.makeTranslation(this.markX[i], 0.12, z);
      this.marks.setMatrixAt(i, this.matrix);
    }
    this.marks.instanceMatrix.needsUpdate = true;
  }

  /** The bridge is fixed geometry; a resize only moves the camera. */
  get anchorY(): number {
    return ARMY_BASE_Y;
  }
}
