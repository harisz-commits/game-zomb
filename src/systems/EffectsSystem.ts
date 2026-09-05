import Phaser from 'phaser';
import { BALANCE } from '../config/BalanceConfig';
import { ENTITY_LIMITS, FONT_FAMILY } from '../config/GameConfig';
import type { Viewport } from '../core/Viewport';
import { TEX } from '../render/TextureFactory';
import { ObjectPool } from '../utils/ObjectPool';
import type { QualityManager } from './QualityManager';

interface Tracer {
  sprite: Phaser.GameObjects.Image;
  life: number;
  maxLife: number;
}

interface Particle {
  sprite: Phaser.GameObjects.Image;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  drag: number;
  spin: number;
}

interface Blast {
  sprite: Phaser.GameObjects.Image;
  ring: Phaser.GameObjects.Image;
  life: number;
  maxLife: number;
  radius: number;
}

interface DamageNumber {
  text: Phaser.GameObjects.Text;
  life: number;
  vy: number;
}

interface Zone {
  sprite: Phaser.GameObjects.Image;
  life: number;
  maxLife: number;
  pulse: number;
}

/**
 * All transient visuals live here, every one of them pooled.
 *
 * Emitters take *world* coordinates and project them once, at emission. After
 * that a particle simply drifts in screen space, which is both cheaper and
 * correct: a spark thrown off a distant enemy should stay the size it was born.
 *
 * Quality level only scales *how many* effects are emitted - never gameplay.
 */
export class EffectsSystem {
  private readonly tracers: ObjectPool<Tracer>;
  private readonly particles: ObjectPool<Particle>;
  private readonly blasts: ObjectPool<Blast>;
  private readonly numbers: ObjectPool<DamageNumber>;
  private readonly zones: ObjectPool<Zone>;

  private readonly activeTracers: Tracer[] = [];
  private readonly activeParticles: Particle[] = [];
  private readonly activeBlasts: Blast[] = [];
  private readonly activeNumbers: DamageNumber[] = [];
  private readonly activeZones: Zone[] = [];

  private shakeTime = 0;
  private shakeIntensity = 0;

  constructor(
    scene: Phaser.Scene,
    layer: Phaser.GameObjects.Layer,
    private readonly viewport: Viewport,
    private readonly quality: QualityManager,
    private readonly camera: Phaser.Cameras.Scene2D.Camera,
  ) {
    this.tracers = new ObjectPool<Tracer>(
      () => {
        const sprite = scene.add.image(0, 0, TEX.tracer).setVisible(false).setDepth(40);
        layer.add(sprite);
        return { sprite, life: 0, maxLife: 0.07 };
      },
      (t) => t.sprite.setVisible(false),
      ENTITY_LIMITS.maxVisualProjectiles,
      24,
    );

    this.particles = new ObjectPool<Particle>(
      () => {
        const sprite = scene.add.image(0, 0, TEX.spark).setVisible(false).setDepth(41);
        layer.add(sprite);
        return { sprite, vx: 0, vy: 0, life: 0, maxLife: 0.4, drag: 2, spin: 0 };
      },
      (p) => p.sprite.setVisible(false),
      ENTITY_LIMITS.maxParticles,
      40,
    );

    this.blasts = new ObjectPool<Blast>(
      () => {
        const sprite = scene.add.image(0, 0, TEX.disc).setVisible(false).setDepth(42);
        const ring = scene.add.image(0, 0, TEX.ring).setVisible(false).setDepth(42);
        layer.add(sprite);
        layer.add(ring);
        return { sprite, ring, life: 0, maxLife: 0.35, radius: 60 };
      },
      (b) => {
        b.sprite.setVisible(false);
        b.ring.setVisible(false);
      },
      ENTITY_LIMITS.maxExplosions,
      6,
    );

    this.numbers = new ObjectPool<DamageNumber>(
      () => {
        const text = scene.add
          .text(0, 0, '', {
            fontFamily: FONT_FAMILY,
            fontSize: '20px',
            color: '#ffffff',
            fontStyle: 'bold',
          })
          .setOrigin(0.5)
          .setVisible(false)
          .setDepth(60);
        layer.add(text);
        return { text, life: 0, vy: -60 };
      },
      (n) => n.text.setVisible(false),
      ENTITY_LIMITS.maxDamageNumbers,
      8,
    );

    this.zones = new ObjectPool<Zone>(
      () => {
        const sprite = scene.add.image(0, 0, TEX.disc).setVisible(false).setDepth(20);
        layer.add(sprite);
        return { sprite, life: 0, maxLife: 1, pulse: 0 };
      },
      (z) => z.sprite.setVisible(false),
      12,
      2,
    );
  }

  /* ----------------------------------------------------------- emitters -- */

  /** A visual tracer. Combat decides *whether* to draw one (see quality). */
  tracer(x1: number, y1: number, x2: number, y2: number, color: number, width = 1): void {
    const item = this.tracers.obtain();
    if (!item) return;
    // Both ends are projected, so a shot fired "straight ahead" from the edge
    // of the field draws the converging line perspective demands.
    const px1 = this.viewport.projectX(x1, y1);
    const px2 = this.viewport.projectX(x2, y2);
    const dx = px2 - px1;
    const dy = y2 - y1;
    const length = Math.max(8, Math.sqrt(dx * dx + dy * dy));

    item.sprite
      .setVisible(true)
      .setPosition((px1 + px2) / 2, (y1 + y2) / 2)
      .setRotation(Math.atan2(dy, dx) - Math.PI / 2)
      .setDisplaySize(3 * width * this.viewport.depthScale(y2), length)
      .setTint(color)
      .setAlpha(0.9);
    item.life = 0;
    item.maxLife = 0.06;
    this.activeTracers.push(item);
  }

  muzzle(x: number, y: number, color: number): void {
    const q = this.quality.settings;
    if (q.particleScale < 0.35) return;
    const item = this.particles.obtain();
    if (!item) return;
    item.sprite
      .setVisible(true)
      .setTexture(TEX.muzzle)
      .setPosition(this.viewport.projectX(x, y), y)
      .setTint(color)
      .setAlpha(0.9)
      .setScale(0.7 * this.viewport.depthScale(y))
      .setRotation(Math.random() * Math.PI);
    item.vx = 0;
    item.vy = -40;
    item.life = 0;
    item.maxLife = 0.07;
    item.drag = 6;
    item.spin = 0;
    this.activeParticles.push(item);
  }

  impact(x: number, y: number, color: number, amount = 3): void {
    const q = this.quality.settings;
    const count = Math.max(1, Math.round(amount * q.particleScale));
    const depth = this.viewport.depthScale(y);
    const px = this.viewport.projectX(x, y);
    for (let i = 0; i < count; i++) {
      const item = this.particles.obtain();
      if (!item) return;
      const angle = Math.random() * Math.PI * 2;
      const speed = (60 + Math.random() * 120) * depth;
      item.sprite
        .setVisible(true)
        .setTexture(TEX.spark)
        .setPosition(px, y)
        .setTint(color)
        .setAlpha(1)
        .setScale((0.6 + Math.random() * 0.5) * depth)
        .setRotation(angle);
      item.vx = Math.cos(angle) * speed;
      item.vy = Math.sin(angle) * speed;
      item.life = 0;
      item.maxLife = 0.22 + Math.random() * 0.16;
      item.drag = 4;
      item.spin = (Math.random() - 0.5) * 12;
      this.activeParticles.push(item);
    }
  }

  explosion(x: number, y: number, radius: number, color = 0xffb648): void {
    const item = this.blasts.obtain();
    const depth = this.viewport.depthScale(y);
    const px = this.viewport.projectX(x, y);
    const drawn = radius * depth;
    if (item) {
      item.sprite
        .setVisible(true)
        .setPosition(px, y)
        .setTint(color)
        .setAlpha(0.85)
        .setDisplaySize(drawn * 1.6, drawn * 1.6);
      item.ring
        .setVisible(true)
        .setPosition(px, y)
        .setTint(color)
        .setAlpha(0.9)
        .setDisplaySize(drawn * 0.7, drawn * 0.7);
      item.life = 0;
      item.maxLife = 0.34;
      item.radius = drawn;
      this.activeBlasts.push(item);
    }
    this.impact(x, y, color, 6);
    this.shake(radius / 320, 0.18);
  }

  /** Persistent ground effect (napalm). */
  zone(x: number, y: number, radius: number, duration: number, color = 0xff7a3c): void {
    const item = this.zones.obtain();
    if (!item) return;
    const depth = this.viewport.depthScale(y);
    item.sprite
      .setVisible(true)
      .setPosition(this.viewport.projectX(x, y), y)
      .setTint(color)
      .setAlpha(0.32)
      .setDisplaySize(radius * 2 * depth, radius * 2 * depth * 0.8);
    item.life = 0;
    item.maxLife = duration;
    item.pulse = 0;
    this.activeZones.push(item);
  }

  damageNumber(x: number, y: number, amount: number, crit: boolean): void {
    if (!this.quality.settings.damageNumbers) return;
    const item = this.numbers.obtain();
    if (!item) return;
    // Text only follows the perspective part of the way: a damage number that
    // shrank as hard as the sprite it belongs to would be unreadable up-field.
    const readable = 0.72 + 0.28 * this.viewport.depthScale(y);
    item.text
      .setVisible(true)
      .setPosition(this.viewport.projectX(x, y), y)
      .setText(String(Math.max(1, Math.round(amount))))
      .setColor(crit ? '#ffd166' : '#ffffff')
      .setFontSize(crit ? 26 : 19)
      .setAlpha(1)
      .setScale((crit ? 1.1 : 1) * readable);
    item.life = 0;
    item.vy = crit ? -95 : -70;
    this.activeNumbers.push(item);
  }

  /** Larger callout text (doctrine unlocked, supply drop, phase name). */
  floatingText(x: number, y: number, label: string, color: string, size = 30): void {
    const item = this.numbers.obtain();
    if (!item) return;
    item.text
      .setVisible(true)
      .setPosition(this.viewport.projectX(x, y), y)
      .setText(label)
      .setColor(color)
      .setFontSize(size)
      .setAlpha(1)
      .setScale(0.78 + 0.22 * this.viewport.depthScale(y));
    item.life = 0;
    item.vy = -34;
    this.activeNumbers.push(item);
  }

  /**
   * Screen shake. A stronger shake overrides a weaker one that is still
   * running; a weaker one is ignored so a stream of small impacts cannot
   * drown out an explosion.
   */
  shake(intensity: number, duration: number): void {
    const scaled = Math.min(0.02, intensity * this.quality.settings.shakeScale);
    if (scaled <= 0.0005) return;
    if (this.shakeTime > 0 && scaled <= this.shakeIntensity) return;

    this.shakeIntensity = scaled;
    this.shakeTime = duration;
    this.camera.shake(duration * 1000, scaled, true);
  }

  /* -------------------------------------------------------------- update -- */

  update(dt: number): void {
    this.updateTracers(dt);
    this.updateParticles(dt);
    this.updateBlasts(dt);
    this.updateNumbers(dt);
    this.updateZones(dt);

    // The camera effect runs itself; we only track when it is done so a new
    // shake knows whether it may take over.
    if (this.shakeTime > 0) {
      this.shakeTime -= dt;
      if (this.shakeTime <= 0) this.shakeIntensity = 0;
    }
  }

  private updateTracers(dt: number): void {
    for (let i = this.activeTracers.length - 1; i >= 0; i--) {
      const item = this.activeTracers[i];
      item.life += dt;
      const t = item.life / item.maxLife;
      if (t >= 1) {
        this.tracers.release(item);
        this.activeTracers.splice(i, 1);
        continue;
      }
      item.sprite.setAlpha(0.9 * (1 - t));
    }
  }

  private updateParticles(dt: number): void {
    for (let i = this.activeParticles.length - 1; i >= 0; i--) {
      const item = this.activeParticles[i];
      item.life += dt;
      const t = item.life / item.maxLife;
      if (t >= 1) {
        this.particles.release(item);
        this.activeParticles.splice(i, 1);
        continue;
      }
      const decay = Math.exp(-item.drag * dt);
      item.vx *= decay;
      item.vy *= decay;
      item.sprite.x += item.vx * dt;
      item.sprite.y += item.vy * dt;
      item.sprite.rotation += item.spin * dt;
      item.sprite.setAlpha(1 - t);
    }
  }

  private updateBlasts(dt: number): void {
    for (let i = this.activeBlasts.length - 1; i >= 0; i--) {
      const item = this.activeBlasts[i];
      item.life += dt;
      const t = item.life / item.maxLife;
      if (t >= 1) {
        this.blasts.release(item);
        this.activeBlasts.splice(i, 1);
        continue;
      }
      const grow = 0.6 + t * 1.5;
      item.sprite.setAlpha(0.85 * (1 - t)).setDisplaySize(item.radius * grow, item.radius * grow);
      const ringSize = item.radius * (0.6 + t * 2.4);
      item.ring.setAlpha(0.9 * (1 - t) ** 2).setDisplaySize(ringSize, ringSize);
    }
  }

  private updateNumbers(dt: number): void {
    for (let i = this.activeNumbers.length - 1; i >= 0; i--) {
      const item = this.activeNumbers[i];
      item.life += dt;
      const t = item.life / BALANCE.DAMAGE_NUMBER_LIFETIME;
      if (t >= 1) {
        this.numbers.release(item);
        this.activeNumbers.splice(i, 1);
        continue;
      }
      item.text.y += item.vy * dt;
      item.vy *= Math.exp(-2.4 * dt);
      item.text.setAlpha(1 - t * t);
    }
  }

  private updateZones(dt: number): void {
    for (let i = this.activeZones.length - 1; i >= 0; i--) {
      const item = this.activeZones[i];
      item.life += dt;
      const t = item.life / item.maxLife;
      if (t >= 1) {
        this.zones.release(item);
        this.activeZones.splice(i, 1);
        continue;
      }
      item.pulse += dt * 9;
      item.sprite.setAlpha((0.32 + Math.sin(item.pulse) * 0.08) * (1 - t));
    }
  }

  /** Releases everything (scene shutdown / retry). */
  clear(): void {
    for (const item of this.activeTracers) this.tracers.release(item);
    for (const item of this.activeParticles) this.particles.release(item);
    for (const item of this.activeBlasts) this.blasts.release(item);
    for (const item of this.activeNumbers) this.numbers.release(item);
    for (const item of this.activeZones) this.zones.release(item);
    this.activeTracers.length = 0;
    this.activeParticles.length = 0;
    this.activeBlasts.length = 0;
    this.activeNumbers.length = 0;
    this.activeZones.length = 0;
    this.shakeTime = 0;
    this.shakeIntensity = 0;
  }

  get debugCounts(): { tracers: number; particles: number } {
    return { tracers: this.activeTracers.length, particles: this.activeParticles.length };
  }

  /** Scene teardown: release pooled objects; the scene owns the display list. */
  destroy(): void {
    this.clear();
  }
}
