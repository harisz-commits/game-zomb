import * as THREE from 'three';
import { BALANCE } from '../config/BalanceConfig';
import { ARMY_BASE_Y, ENTITY_LIMITS, FIELD_W } from '../config/GameConfig';
import type { BattleContext } from '../core/BattleContext';
import type { EnemyKind } from '../types/game';
import { ActorPool } from './ActorPool';
import { Bridge } from './Bridge';
import { mergeBoxes, modelMaterial, shade } from './BoxModel';
import {
  BRUTE_HIP_Y,
  BRUTE_LEG_X,
  SOLDIER_HEIGHT,
  SOLDIER_HIP_Y,
  SOLDIER_LEG_X,
  ZOMBIE_HEIGHT,
  ZOMBIE_HIP_Y,
  ZOMBIE_LEG_X,
  bruteBody,
  bruteLeg,
  soldierBody,
  soldierLeg,
  zombieBody,
  zombieLeg,
  type BruteLook,
  type SoldierLook,
  type ZombieLook,
} from './Models';
import { Stage, WORLD_TO_SCENE, sceneX, sceneZ } from './Stage';

/**
 * How large a soldier model is at unit scale 1.
 *
 * Derived, not guessed: the reference squad's body is 0.13 of the screen
 * height at the firing line, which works out to this fraction of the deck
 * width. Everything else on the battlefield is sized relative to it.
 */
const SOLDIER_WORLD_HEIGHT = FIELD_W * 0.216 * WORLD_TO_SCENE;
const SOLDIER_MODEL_SCALE = SOLDIER_WORLD_HEIGHT / SOLDIER_HEIGHT;
/** The horde is drawn smaller than the squad - see the note in the README. */
const ZOMBIE_MODEL_SCALE = (SOLDIER_WORLD_HEIGHT * 0.62) / ZOMBIE_HEIGHT;

const ZOMBIE_LOOKS: Record<string, ZombieLook> = {
  WALKER: { skin: 0x9db396, cloth: 0x5f6455 },
  RUNNER: { skin: 0xb6c9ab, cloth: 0x4f6166, band: true },
  ARMORED: { skin: 0x93a88d, cloth: 0x4b5460, armored: true },
  SWARMER: { skin: 0xa9bd9e, cloth: 0x6d6a52 },
  SPITTER: { skin: 0xa9c081, cloth: 0x5f6b45 },
};
const BRUTE_LOOKS: Record<string, BruteLook> = {
  BRUTE: { skin: 0xb08b74, apron: 0x8a7460 },
  BOSS_CRUSHER: { skin: 0xb98f74, apron: 0x7d6c58 },
  BOSS_ABOMINATION: { skin: 0x89a76a, apron: 0x5d7049 },
};

/** Which model pool draws each enemy kind, and how big it is drawn. */
const ENEMY_MODEL: Record<EnemyKind, { pool: string; scale: number }> = {
  WALKER: { pool: 'WALKER', scale: 1 },
  RUNNER: { pool: 'RUNNER', scale: 0.95 },
  ARMORED: { pool: 'ARMORED', scale: 1.08 },
  SWARMER: { pool: 'SWARMER', scale: 0.72 },
  SPITTER: { pool: 'SPITTER', scale: 1 },
  BRUTE: { pool: 'BRUTE', scale: 1.5 },
  BOSS_CRUSHER: { pool: 'BOSS_CRUSHER', scale: 2.6 },
  BOSS_ABOMINATION: { pool: 'BOSS_ABOMINATION', scale: 2.4 },
};

/** Pooled instanced boxes for one kind of transient prop. */
class BoxPool {
  readonly mesh: THREE.InstancedMesh;
  private readonly dummy = new THREE.Object3D();
  private readonly colour = new THREE.Color();
  private readonly capacity: number;
  private used = 0;

  constructor(scene: THREE.Scene, capacity: number, material: THREE.Material, size = 1) {
    this.capacity = capacity;
    // A unit box with white vertex colours: three only applies the per-instance
    // colour when the material declares vertexColors, and that in turn needs a
    // colour attribute to multiply against.
    const geometry = new THREE.BoxGeometry(size, size, size);
    const white = new Float32Array(geometry.attributes.position.count * 3).fill(1);
    geometry.setAttribute('color', new THREE.BufferAttribute(white, 3));
    this.mesh = new THREE.InstancedMesh(geometry, material, capacity);
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    scene.add(this.mesh);
  }

  begin(): void {
    this.used = 0;
  }

  place(
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
    color: number,
    yaw = 0,
    pitch = 0,
  ): void {
    if (this.used >= this.capacity) return;
    this.dummy.position.set(x, y, z);
    this.dummy.rotation.set(pitch, yaw, 0, 'YXZ');
    this.dummy.scale.set(sx, sy, sz);
    this.dummy.updateMatrix();
    this.mesh.setMatrixAt(this.used, this.dummy.matrix);
    this.colour.setHex(color);
    this.mesh.setColorAt(this.used, this.colour);
    this.used++;
  }

  end(): void {
    this.mesh.count = this.used;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}

/**
 * Turns the simulation's state into a frame.
 *
 * The systems own positions, HP and timers and know nothing about rendering;
 * this walks their arrays once per frame and writes instanced transforms. That
 * split is why the move from sprites to 3D touched no gameplay code.
 */
export class BattleView {
  private readonly bridge: Bridge;
  private soldiers: ActorPool;
  private readonly enemies = new Map<string, ActorPool>();

  private readonly crates: BoxPool;
  private readonly crateTrim: BoxPool;
  private readonly barriers: BoxPool;
  private readonly tracers: BoxPool;
  private readonly sparks: BoxPool;
  private readonly blasts: BoxPool;
  private readonly zones: BoxPool;
  private readonly glyphs: THREE.InstancedMesh[] = [];

  private shownTier = -1;
  private shownWeapon = -1;
  private time = 0;
  private shakeSeed = 0;

  constructor(
    private readonly stage: Stage,
    private readonly ctx: BattleContext,
    private readonly labels: HTMLElement,
  ) {
    this.bridge = new Bridge(stage.scene);
    this.soldiers = this.buildSoldierPool();

    for (const [kind, look] of Object.entries(ZOMBIE_LOOKS)) {
      this.enemies.set(
        kind,
        new ActorPool(
          stage.scene,
          zombieBody(look),
          zombieLeg(look),
          ZOMBIE_HIP_Y,
          ZOMBIE_LEG_X,
          kind === 'WALKER' ? ENTITY_LIMITS.maxActiveZombies : 90,
        ),
      );
    }
    for (const [kind, look] of Object.entries(BRUTE_LOOKS)) {
      this.enemies.set(
        kind,
        new ActorPool(stage.scene, bruteBody(look), bruteLeg(look), BRUTE_HIP_Y, BRUTE_LEG_X, 24),
      );
    }

    const lit = modelMaterial();
    const ice = new THREE.MeshLambertMaterial({
      vertexColors: true,
      flatShading: true,
      transparent: true,
      opacity: 0.94,
    });
    const additive = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const flat = new THREE.MeshBasicMaterial({ vertexColors: true });

    this.crates = new BoxPool(stage.scene, 26, ice);
    this.crates.mesh.castShadow = true;
    this.crateTrim = new BoxPool(stage.scene, 26, lit);
    this.barriers = new BoxPool(stage.scene, 8, lit);
    this.barriers.mesh.castShadow = true;
    this.tracers = new BoxPool(stage.scene, ENTITY_LIMITS.maxVisualProjectiles, flat);
    this.sparks = new BoxPool(stage.scene, ENTITY_LIMITS.maxParticles, additive);
    this.blasts = new BoxPool(stage.scene, ENTITY_LIMITS.maxExplosions * 2, additive);
    this.zones = new BoxPool(stage.scene, 12, additive);

    this.buildGlyphs();
  }

  /** A neon gun glyph per weapon tier, shown on the crate that grants it. */
  private buildGlyphs(): void {
    const green = 0x6cff86;
    for (let level = 0; level < 6; level++) {
      const geo = mergeBoxes([
        { p: [0, 0, 0], s: [6 + level, 0.7, 0.7], c: green },
        { p: [-1.4, -0.2, 0], s: [2.6, 1.8, 0.7], c: green },
        { p: [-2.1, -1.7, 0], s: [1.0, 2.0 + level * 0.2, 0.7], c: green },
        { p: [3 + level * 0.4, 0.9, 0], s: [1.4, 0.7, 0.7], c: green },
      ]);
      const mesh = new THREE.InstancedMesh(
        geo,
        new THREE.MeshBasicMaterial({ vertexColors: true }),
        6,
      );
      mesh.frustumCulled = false;
      mesh.count = 0;
      this.stage.scene.add(mesh);
      this.glyphs.push(mesh);
    }
  }

  private soldierLook(): SoldierLook {
    const tier = this.ctx.promotion.currentTier;
    return {
      body: tier.bodyColor,
      vest: shade(tier.bodyColor, 0.42),
      helmet: tier.helmetColor,
      accent: tier.accentColor,
      gun: tier.weaponColor,
    };
  }

  private buildSoldierPool(): ActorPool {
    const look = this.soldierLook();
    const weapon = this.ctx.upgrades.weaponIndex;
    this.shownTier = this.ctx.promotion.currentTierIndex;
    this.shownWeapon = weapon;
    return new ActorPool(
      this.stage.scene,
      soldierBody(look, weapon),
      soldierLeg(look),
      SOLDIER_HIP_Y,
      SOLDIER_LEG_X,
      ENTITY_LIMITS.maxVisibleSoldiers + 30,
    );
  }

  /**
   * Rebuilds the squad's geometry when the tier or the weapon changes.
   *
   * Rare - a handful of times per run - so a dispose and rebuild is cheaper
   * than carrying every tier/weapon combination in memory from the start.
   */
  private refreshSoldiers(): void {
    const tier = this.ctx.promotion.currentTierIndex;
    const weapon = this.ctx.upgrades.weaponIndex;
    if (tier === this.shownTier && weapon === this.shownWeapon) return;
    this.soldiers.dispose();
    this.soldiers = this.buildSoldierPool();
  }

  update(dt: number, frozen: boolean): void {
    this.time += dt;
    this.bridge.update(frozen ? dt * 0.15 : dt);
    this.refreshSoldiers();
    this.drawSoldiers(dt);
    this.drawEnemies(dt);
    this.drawLaneObjects();
    this.drawEffects();
    this.applyShake(dt);
  }

  /* -------------------------------------------------------------- units -- */

  private drawSoldiers(dt: number): void {
    const army = this.ctx.army;
    const scale = SOLDIER_MODEL_SCALE * army.unitScale;
    this.soldiers.begin();
    for (const soldier of army.soldiers) {
      // A soldier walking into formation strides; one on the line shuffles.
      const moving = Math.abs(soldier.y - soldier.slotY) > 2;
      soldier.stride += dt * (moving ? 9 : 2.4);
      const eased = soldier.spawnT * soldier.spawnT * (3 - 2 * soldier.spawnT);
      const index = this.soldiers.place(
        soldier.x,
        soldier.y,
        scale * (0.55 + eased * 0.45),
        soldier.stride,
        Math.PI,
      );
      // Hit flash: instance colour above 1 brightens the baked vertex colours.
      const flash = soldier.flash > 0 ? 1 + soldier.flash * 14 : 1;
      this.soldiers.tint(index, flash, flash, flash);
    }
    this.soldiers.end();
  }

  private drawEnemies(dt: number): void {
    for (const pool of this.enemies.values()) pool.begin();
    for (const zombie of this.ctx.enemies.active) {
      const model = ENEMY_MODEL[zombie.kind];
      const pool = this.enemies.get(model.pool);
      if (!pool) continue;
      zombie.stride += dt * (zombie.engaged ? 5 : 2 + zombie.speed * 0.02);
      const index = pool.place(
        zombie.x,
        zombie.y,
        ZOMBIE_MODEL_SCALE * model.scale * zombie.baseScale,
        zombie.stride,
        0,
      );
      const flash = zombie.flash > 0 ? 2.4 : 1;
      if (zombie.elite) pool.tint(index, flash * 1.5, flash * 0.75, flash * 1.25);
      else pool.tint(index, flash, flash, flash);
    }
    for (const pool of this.enemies.values()) pool.end();
  }

  /* --------------------------------------------------------------- lanes */

  private drawLaneObjects(): void {
    this.crates.begin();
    this.crateTrim.begin();
    this.barriers.begin();
    const glyphCounts = new Array(this.glyphs.length).fill(0);
    const dummy = new THREE.Object3D();

    for (const item of this.ctx.laneObjects.active) {
      const x = sceneX(item.x);
      const z = sceneZ(item.y);
      const w = item.width * WORLD_TO_SCENE;
      const d = item.height * WORLD_TO_SCENE;
      const h = item.kind === 'ICE' ? Math.min(w, d) * 0.95 : d * 1.4;

      if (item.kind === 'ICE') {
        this.crates.place(x, h / 2, z, w, h, d, item.flash > 0 ? 0xffffff : 0x53c8f2);
        // A frost rim top and bottom, so stacked crates still read as
        // separate blocks rather than one long slab of glass.
        this.crateTrim.place(x, h - 0.1, z, w * 1.03, 0.7, d * 0.99, 0xeafaff);
        this.crateTrim.place(x, 0.35, z, w * 1.03, 0.7, d * 0.99, 0x9fd9ef);
        if (item.iconWeapon >= 0 && item.iconWeapon < this.glyphs.length) {
          const mesh = this.glyphs[item.iconWeapon];
          const slot = glyphCounts[item.iconWeapon];
          if (slot < 6) {
            dummy.position.set(x, h * 0.62, z + d / 2 + 0.4);
            dummy.rotation.set(0, 0, 0);
            dummy.scale.setScalar(Math.min(w, h) * 0.1);
            dummy.updateMatrix();
            mesh.setMatrixAt(slot, dummy.matrix);
            glyphCounts[item.iconWeapon] = slot + 1;
          }
        }
      } else {
        const spent = item.hpRatio <= 0;
        this.barriers.place(x, h / 2, z, w, h, d * 0.5, spent ? 0x4c7a5c : 0xe8483a);
        this.barriers.place(x - w / 2, h * 0.6, z, 1.6, h * 1.2, d * 0.6, 0x8f1f1c);
        this.barriers.place(x + w / 2, h * 0.6, z, 1.6, h * 1.2, d * 0.6, 0x8f1f1c);
      }
    }

    this.glyphs.forEach((mesh, i) => {
      mesh.count = glyphCounts[i];
      mesh.instanceMatrix.needsUpdate = true;
    });
    this.crates.end();
    this.crateTrim.end();
    this.barriers.end();
    this.drawLabels();
  }

  /* -------------------------------------------------------------- labels */

  private readonly labelNodes: HTMLElement[] = [];
  private readonly projected = { x: 0, y: 0 };
  private readonly projectedTop = { x: 0, y: 0 };

  /**
   * Pixels per scene unit at a point, by projecting the point and another one
   * a unit above it. Labels are sized with this, so a crate at the far end of
   * the bridge gets a small number and one at the line gets a big one - the
   * same rule the geometry follows.
   */
  private pixelsPerUnit(x: number, y: number, z: number): number {
    this.stage.project(x, y, z, this.projected);
    this.stage.project(x, y + 1, z, this.projectedTop);
    return Math.max(0.2, Math.abs(this.projected.y - this.projectedTop.y));
  }

  /**
   * Crate numbers and floating text as DOM, positioned by projecting their
   * world point. Text in the DOM is sharper than anything drawn into the
   * canvas, costs no draw call, and scales with the device for free.
   */
  private drawLabels(): void {
    let used = 0;
    const take = (): HTMLElement => {
      let node = this.labelNodes[used];
      if (!node) {
        node = document.createElement('div');
        node.className = 'world-label';
        this.labels.appendChild(node);
        this.labelNodes.push(node);
      }
      used++;
      return node;
    };

    for (const item of this.ctx.laneObjects.active) {
      const shown =
        item.kind === 'ICE'
          ? Math.max(0, Math.ceil(item.hp))
          : Math.max(0, Math.ceil(item.penalty * item.hpRatio));
      const w = item.width * WORLD_TO_SCENE;
      const d = item.height * WORLD_TO_SCENE;
      const h = item.kind === 'ICE' ? Math.min(w, d) * 0.95 : d * 1.4;
      const lx = sceneX(item.x);
      const ly = h * 0.55;
      const lz = sceneZ(item.y) + d / 2 + 0.6;
      const perUnit = this.pixelsPerUnit(lx, ly, lz);
      if (!this.stage.project(lx, ly, lz, this.projected)) continue;
      const node = take();
      const text = item.kind === 'ICE' ? compact(shown) : `-${shown}`;
      if (node.textContent !== text) node.textContent = text;
      node.className = item.kind === 'ICE' ? 'world-label crate' : 'world-label barrier';
      node.style.fontSize = `${Math.max(9, Math.min(46, perUnit * h * 0.42))}px`;
      node.style.transform = `translate(-50%,-50%) translate(${this.projected.x}px, ${this.projected.y}px)`;
      node.style.display = 'block';
    }

    for (const item of this.ctx.effects.numbers) {
      const lx = sceneX(item.x);
      const lz = sceneZ(item.y);
      const perUnit = this.pixelsPerUnit(lx, 9, lz);
      if (!this.stage.project(lx, 9, lz, this.projected)) continue;
      const node = take();
      if (node.textContent !== item.text) node.textContent = item.text;
      node.className = 'world-label float';
      node.style.color = item.color;
      // Damage numbers follow the same perspective as the thing they came off.
      node.style.fontSize = `${Math.max(8, Math.min(34, perUnit * item.size * 0.22))}px`;
      const t = item.life / item.maxLife;
      node.style.opacity = String(1 - t * t);
      node.style.transform = `translate(-50%,-50%) translate(${this.projected.x}px, ${this.projected.y}px)`;
      node.style.display = 'block';
    }

    for (let i = used; i < this.labelNodes.length; i++) this.labelNodes[i].style.display = 'none';
  }

  /* ------------------------------------------------------------- effects */

  private drawEffects(): void {
    const effects = this.ctx.effects;

    this.tracers.begin();
    for (const t of effects.tracers) {
      const x1 = sceneX(t.x1);
      const z1 = sceneZ(t.y1);
      const x2 = sceneX(t.x2);
      const z2 = sceneZ(t.y2);
      const dx = x2 - x1;
      const dz = z2 - z1;
      const length = Math.max(1, Math.hypot(dx, dz));
      const fade = 1 - t.life / t.maxLife;
      this.tracers.place(
        (x1 + x2) / 2,
        7.5,
        (z1 + z2) / 2,
        0.22 * t.width,
        0.22 * t.width,
        length,
        t.color,
        Math.atan2(dx, dz),
      );
      void fade;
    }
    this.tracers.end();

    this.sparks.begin();
    for (const p of effects.particles) {
      const fade = 1 - p.life / p.maxLife;
      const s = p.scale * fade * 0.6;
      this.sparks.place(sceneX(p.x), p.z * WORLD_TO_SCENE * 3, sceneZ(p.y), s, s, s, p.color);
    }
    this.sparks.end();

    this.blasts.begin();
    for (const b of effects.blasts) {
      const t = b.life / b.maxLife;
      const size = b.radius * WORLD_TO_SCENE * (0.5 + t * 1.8);
      this.blasts.place(sceneX(b.x), size * 0.4, sceneZ(b.y), size, size * 0.7, size, b.color, t * 2);
    }
    this.blasts.end();

    this.zones.begin();
    for (const z of effects.zones) {
      const size = z.radius * WORLD_TO_SCENE * 2;
      this.zones.place(sceneX(z.x), 0.4, sceneZ(z.y), size, 0.3, size, z.color);
    }
    this.zones.end();
  }

  private applyShake(dt: number): void {
    const camera = this.stage.camera;
    const amount = this.ctx.effects.shakeIntensity;
    if (amount <= 0) {
      camera.position.x = 0;
      camera.position.y = this.stage.homeY;
      return;
    }
    this.shakeSeed += dt * 60;
    const magnitude = amount * 160;
    camera.position.x = Math.sin(this.shakeSeed * 1.7) * magnitude;
    camera.position.y = this.stage.homeY + Math.sin(this.shakeSeed * 2.3) * magnitude * 0.6;
  }

  /** The world x the formation should follow for a screen pointer. */
  pointerToWorldX(screenX: number, screenY: number): number {
    return this.stage.worldXAtScreen(screenX, screenY);
  }

  get anchorY(): number {
    return ARMY_BASE_Y;
  }

  destroy(): void {
    for (const node of this.labelNodes) node.remove();
    this.labelNodes.length = 0;
  }
}

/** Compact number formatting, so a late-run crate reads "16K". */
function compact(value: number): string {
  if (value < 1000) return String(value);
  if (value < 1_000_000) {
    const k = value / 1000;
    return `${k < 10 ? k.toFixed(1) : Math.floor(k)}K`;
  }
  const m = value / 1_000_000;
  return `${m < 10 ? m.toFixed(2) : m.toFixed(1)}M`;
}

void BALANCE;
