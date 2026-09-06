import { BALANCE } from '../config/BalanceConfig';
import { ENTITY_LIMITS } from '../config/GameConfig';
import { ObjectPool } from '../utils/ObjectPool';
import type { QualityManager } from './QualityManager';

/**
 * Every transient visual, as plain data.
 *
 * This system owns *what* is happening - a tracer between two points, a spark
 * with a velocity, a number floating up - and nothing about how it is drawn.
 * `BattleView` walks these lists once a frame and turns them into instanced
 * geometry. Keeping them renderer-agnostic is what let the game move from
 * sprites to 3D without touching a line of combat code.
 *
 * Everything is pooled: nothing in the gameplay loop may allocate per frame.
 */

export interface Tracer {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: number;
  width: number;
  life: number;
  maxLife: number;
}

export interface Particle {
  x: number;
  y: number;
  /** Height above the deck, so sparks arc instead of sliding along it. */
  z: number;
  vx: number;
  vy: number;
  vz: number;
  color: number;
  scale: number;
  life: number;
  maxLife: number;
  drag: number;
  spin: number;
}

export interface Blast {
  x: number;
  y: number;
  radius: number;
  color: number;
  life: number;
  maxLife: number;
}

export interface FloatingNumber {
  x: number;
  y: number;
  text: string;
  color: string;
  size: number;
  life: number;
  maxLife: number;
  vy: number;
  /** Set by the view when it hands out a DOM node. */
  node: HTMLElement | null;
}

export interface Zone {
  x: number;
  y: number;
  radius: number;
  color: number;
  life: number;
  maxLife: number;
}

export class EffectsSystem {
  private readonly tracerPool: ObjectPool<Tracer>;
  private readonly particlePool: ObjectPool<Particle>;
  private readonly blastPool: ObjectPool<Blast>;
  private readonly numberPool: ObjectPool<FloatingNumber>;
  private readonly zonePool: ObjectPool<Zone>;

  readonly tracers: Tracer[] = [];
  readonly particles: Particle[] = [];
  readonly blasts: Blast[] = [];
  readonly numbers: FloatingNumber[] = [];
  readonly zones: Zone[] = [];

  /** Current camera shake, drained by the view. */
  shakeIntensity = 0;
  private shakeTime = 0;

  constructor(private readonly quality: QualityManager) {
    this.tracerPool = new ObjectPool<Tracer>(
      () => ({ x1: 0, y1: 0, x2: 0, y2: 0, color: 0xffffff, width: 1, life: 0, maxLife: 0.06 }),
      () => {},
      ENTITY_LIMITS.maxVisualProjectiles,
      24,
    );
    this.particlePool = new ObjectPool<Particle>(
      () => ({
        x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0,
        color: 0xffffff, scale: 1, life: 0, maxLife: 0.4, drag: 2, spin: 0,
      }),
      () => {},
      ENTITY_LIMITS.maxParticles,
      40,
    );
    this.blastPool = new ObjectPool<Blast>(
      () => ({ x: 0, y: 0, radius: 60, color: 0xffb648, life: 0, maxLife: 0.34 }),
      () => {},
      ENTITY_LIMITS.maxExplosions,
      6,
    );
    this.numberPool = new ObjectPool<FloatingNumber>(
      () => ({
        x: 0, y: 0, text: '', color: '#ffffff', size: 20,
        life: 0, maxLife: BALANCE.DAMAGE_NUMBER_LIFETIME, vy: -60, node: null,
      }),
      () => {},
      ENTITY_LIMITS.maxDamageNumbers,
      8,
    );
    this.zonePool = new ObjectPool<Zone>(
      () => ({ x: 0, y: 0, radius: 60, color: 0xff7a3c, life: 0, maxLife: 1 }),
      () => {},
      12,
      2,
    );
  }

  /* ----------------------------------------------------------- emitters -- */

  tracer(x1: number, y1: number, x2: number, y2: number, color: number, width = 1): void {
    const item = this.tracerPool.obtain();
    if (!item) return;
    item.x1 = x1;
    item.y1 = y1;
    item.x2 = x2;
    item.y2 = y2;
    item.color = color;
    item.width = width;
    item.life = 0;
    item.maxLife = 0.06;
    this.tracers.push(item);
  }

  /** Muzzle flash: a bright, short-lived spark that does not travel. */
  muzzle(x: number, y: number, color: number): void {
    if (this.quality.settings.particleScale < 0.35) return;
    const item = this.particlePool.obtain();
    if (!item) return;
    Object.assign(item, {
      x, y, z: 9, vx: 0, vy: 0, vz: 0,
      color, scale: 2.4, life: 0, maxLife: 0.07, drag: 6, spin: 0,
    });
    this.particles.push(item);
  }

  impact(x: number, y: number, color: number, amount = 3): void {
    const count = Math.max(1, Math.round(amount * this.quality.settings.particleScale));
    for (let i = 0; i < count; i++) {
      const item = this.particlePool.obtain();
      if (!item) return;
      const angle = Math.random() * Math.PI * 2;
      const speed = 60 + Math.random() * 120;
      Object.assign(item, {
        x, y, z: 6 + Math.random() * 5,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed * 0.6,
        vz: 40 + Math.random() * 90,
        color,
        scale: 0.8 + Math.random() * 0.8,
        life: 0,
        maxLife: 0.24 + Math.random() * 0.2,
        drag: 3,
        spin: (Math.random() - 0.5) * 12,
      });
      this.particles.push(item);
    }
  }

  explosion(x: number, y: number, radius: number, color = 0xffb648): void {
    const item = this.blastPool.obtain();
    if (item) {
      Object.assign(item, { x, y, radius, color, life: 0, maxLife: 0.34 });
      this.blasts.push(item);
    }
    this.impact(x, y, color, 6);
    this.shake(radius / 320, 0.18);
  }

  /** Persistent ground effect (napalm). */
  zone(x: number, y: number, radius: number, duration: number, color = 0xff7a3c): void {
    const item = this.zonePool.obtain();
    if (!item) return;
    Object.assign(item, { x, y, radius, color, life: 0, maxLife: duration });
    this.zones.push(item);
  }

  damageNumber(x: number, y: number, amount: number, crit: boolean): void {
    if (!this.quality.settings.damageNumbers) return;
    const item = this.numberPool.obtain();
    if (!item) return;
    Object.assign(item, {
      x, y,
      text: String(Math.max(1, Math.round(amount))),
      color: crit ? '#ffd166' : '#ffffff',
      size: crit ? 26 : 19,
      life: 0,
      maxLife: BALANCE.DAMAGE_NUMBER_LIFETIME,
      vy: crit ? -95 : -70,
    });
    this.numbers.push(item);
  }

  /** Larger callout text (weapon unlocked, doctrine, phase name). */
  floatingText(x: number, y: number, label: string, color: string, size = 30): void {
    const item = this.numberPool.obtain();
    if (!item) return;
    Object.assign(item, {
      x, y, text: label, color, size,
      life: 0, maxLife: BALANCE.DAMAGE_NUMBER_LIFETIME * 1.6, vy: -34,
    });
    this.numbers.push(item);
  }

  /**
   * Camera shake. A stronger shake overrides a weaker one that is still
   * running; a weaker one is ignored, so a stream of small impacts cannot
   * drown out an explosion.
   */
  shake(intensity: number, duration: number): void {
    const scaled = Math.min(0.02, intensity * this.quality.settings.shakeScale);
    if (scaled <= 0.0005) return;
    if (this.shakeTime > 0 && scaled <= this.shakeIntensity) return;
    this.shakeIntensity = scaled;
    this.shakeTime = duration;
  }

  /* -------------------------------------------------------------- update -- */

  update(dt: number): void {
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const item = this.tracers[i];
      item.life += dt;
      if (item.life >= item.maxLife) {
        this.tracerPool.release(item);
        this.tracers.splice(i, 1);
      }
    }

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const item = this.particles[i];
      item.life += dt;
      if (item.life >= item.maxLife) {
        this.particlePool.release(item);
        this.particles.splice(i, 1);
        continue;
      }
      const decay = Math.exp(-item.drag * dt);
      item.vx *= decay;
      item.vy *= decay;
      item.x += item.vx * dt;
      item.y += item.vy * dt;
      // Gravity, so sparks arc off the deck instead of sliding along it.
      item.vz -= 320 * dt;
      item.z = Math.max(0.6, item.z + item.vz * dt);
    }

    for (let i = this.blasts.length - 1; i >= 0; i--) {
      const item = this.blasts[i];
      item.life += dt;
      if (item.life >= item.maxLife) {
        this.blastPool.release(item);
        this.blasts.splice(i, 1);
      }
    }

    for (let i = this.numbers.length - 1; i >= 0; i--) {
      const item = this.numbers[i];
      item.life += dt;
      if (item.life >= item.maxLife) {
        this.numberPool.release(item);
        this.numbers.splice(i, 1);
        continue;
      }
      item.y += item.vy * dt * 0.35;
      item.vy *= Math.exp(-2.4 * dt);
    }

    for (let i = this.zones.length - 1; i >= 0; i--) {
      const item = this.zones[i];
      item.life += dt;
      if (item.life >= item.maxLife) {
        this.zonePool.release(item);
        this.zones.splice(i, 1);
      }
    }

    if (this.shakeTime > 0) {
      this.shakeTime -= dt;
      if (this.shakeTime <= 0) this.shakeIntensity = 0;
    }
  }

  clear(): void {
    for (const item of this.tracers) this.tracerPool.release(item);
    for (const item of this.particles) this.particlePool.release(item);
    for (const item of this.blasts) this.blastPool.release(item);
    for (const item of this.numbers) this.numberPool.release(item);
    for (const item of this.zones) this.zonePool.release(item);
    this.tracers.length = 0;
    this.particles.length = 0;
    this.blasts.length = 0;
    this.numbers.length = 0;
    this.zones.length = 0;
    this.shakeTime = 0;
    this.shakeIntensity = 0;
  }

  get debugCounts(): { tracers: number; particles: number } {
    return { tracers: this.tracers.length, particles: this.particles.length };
  }

  destroy(): void {
    this.clear();
  }
}
