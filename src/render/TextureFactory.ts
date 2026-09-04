import Phaser from 'phaser';
import { COLORS } from '../config/GameConfig';
import { SOLDIER_TIERS } from '../data/soldierTiers';

const COLORS_BG_TOP = COLORS.bgTop;
const COLORS_BG_BOTTOM = COLORS.bgBottom;

/**
 * All placeholder art is generated at runtime with Phaser Graphics.
 *
 * Why: zero image bytes in the bundle (huge win for the Playables size
 * budget) and instant iteration. Every sprite is looked up by a stable texture
 * key, so swapping in real artwork later is a matter of loading an atlas in
 * BootScene and *not* calling the matching generator here - no gameplay code
 * references anything but the key.
 *
 * Art direction: stylised, readable silhouettes, no gore.
 */

export const TEX = {
  soldier: (visual: number) => `soldier_t${visual}`,
  shadow: 'fx_shadow',
  tracer: 'fx_tracer',
  spark: 'fx_spark',
  disc: 'fx_disc',
  ring: 'fx_ring',
  muzzle: 'fx_muzzle',
  crate: 'fx_crate',
  spit: 'fx_spit',
  shield: 'fx_shield',
  star: 'fx_star',
  pixel: 'fx_pixel',
  ice: 'lane_ice',
  barrier: 'lane_barrier',
  road: 'lane_road',
  sky: 'lane_sky',
} as const;

function makeTexture(
  scene: Phaser.Scene,
  key: string,
  width: number,
  height: number,
  draw: (g: Phaser.GameObjects.Graphics) => void,
): void {
  if (scene.textures.exists(key)) return;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  draw(g);
  g.generateTexture(key, width, height);
  g.destroy();
}

/* -------------------------------------------------------------- soldiers -- */

const SOLDIER_W = 26;
const SOLDIER_H = 34;

function drawSoldier(
  g: Phaser.GameObjects.Graphics,
  visual: number,
  body: number,
  helmet: number,
  weapon: number,
  accent: number,
): void {
  const cx = SOLDIER_W / 2;

  // Legs
  g.fillStyle(0x1b212b, 1);
  g.fillRect(cx - 5, 24, 4, 8);
  g.fillRect(cx + 1, 24, 4, 8);

  // Torso
  g.fillStyle(body, 1);
  g.fillRect(cx - 6, 13, 12, 12);

  // Chest accent / webbing - gets richer with tier
  g.fillStyle(accent, 1);
  if (visual >= 1) g.fillRect(cx - 6, 16, 12, 2);
  if (visual >= 3) {
    g.fillRect(cx - 6, 20, 12, 2);
    g.fillRect(cx - 1, 13, 2, 12);
  }

  // Shoulders get bulkier on high tiers
  if (visual >= 2) {
    g.fillStyle(body, 1);
    g.fillRect(cx - 8, 13, 3, 6);
    g.fillRect(cx + 5, 13, 3, 6);
  }

  // Head
  g.fillStyle(0xd9b48a, 1);
  g.fillRect(cx - 3, 7, 6, 6);

  // Helmet - shape changes per tier
  g.fillStyle(helmet, 1);
  switch (visual) {
    case 0:
      g.fillRect(cx - 4, 4, 8, 4);
      break;
    case 1:
      g.fillRect(cx - 5, 4, 10, 4);
      g.fillRect(cx - 6, 7, 12, 2); // brim
      break;
    case 2:
      g.fillRect(cx - 5, 3, 10, 5);
      g.fillRect(cx + 4, 6, 2, 3); // comms
      break;
    case 3:
      g.fillRect(cx - 5, 3, 10, 5);
      g.fillStyle(0x0f1218, 1);
      g.fillRect(cx - 4, 7, 8, 3); // balaclava
      break;
    case 4:
      g.fillRect(cx - 5, 3, 10, 5);
      g.fillStyle(accent, 0.9);
      g.fillRect(cx - 4, 7, 8, 3); // visor
      break;
    default:
      g.fillRect(cx - 5, 2, 10, 6);
      g.fillStyle(accent, 0.95);
      g.fillRect(cx - 4, 7, 8, 3);
      g.fillRect(cx - 6, 2, 2, 4);
      g.fillRect(cx + 4, 2, 2, 4);
      break;
  }

  // Weapon - longer and heavier with tier, always pointing up-field
  const barrelLength = 9 + visual * 1.6;
  g.fillStyle(weapon, 1);
  g.fillRect(cx + 5, 18 - barrelLength, 3, barrelLength + 3);
  g.fillRect(cx + 3, 17, 6, 3);
  if (visual >= 2) g.fillRect(cx + 4, 19, 5, 2); // magazine
  if (visual >= 4) {
    g.fillStyle(accent, 0.85);
    g.fillRect(cx + 5, 18 - barrelLength, 3, 2); // muzzle device
  }
}

/* --------------------------------------------------------------- zombies -- */

function drawWalker(g: Phaser.GameObjects.Graphics): void {
  g.fillStyle(0x3d5240, 1);
  g.fillRect(9, 20, 5, 10);
  g.fillRect(16, 20, 5, 10);
  g.fillStyle(0x53724f, 1);
  g.fillRect(8, 9, 14, 13);
  g.fillStyle(0x6b8f63, 1);
  g.fillRect(10, 2, 10, 8); // head
  g.fillStyle(0x2a3a2c, 1);
  g.fillRect(12, 5, 2, 2);
  g.fillRect(17, 5, 2, 2);
  g.fillStyle(0x53724f, 1);
  g.fillRect(2, 11, 7, 4); // outstretched arms
  g.fillRect(21, 11, 7, 4);
}

function drawRunner(g: Phaser.GameObjects.Graphics): void {
  g.fillStyle(0x3a4a52, 1);
  g.fillRect(8, 19, 4, 9);
  g.fillRect(15, 21, 4, 7);
  g.fillStyle(0x5b7a6a, 1);
  g.fillRect(7, 9, 13, 11);
  g.fillStyle(0x7fa389, 1);
  g.fillRect(11, 2, 9, 8);
  g.fillStyle(0x24302c, 1);
  g.fillRect(13, 5, 2, 2);
  g.fillRect(17, 5, 2, 2);
  g.fillStyle(0x5b7a6a, 1);
  g.fillRect(1, 8, 8, 4);
  g.fillRect(18, 12, 8, 4);
}

function drawBrute(g: Phaser.GameObjects.Graphics): void {
  g.fillStyle(0x2f4235, 1);
  g.fillRect(14, 38, 9, 14);
  g.fillRect(26, 38, 9, 14);
  g.fillStyle(0x496b4c, 1);
  g.fillRect(9, 14, 30, 26); // torso
  g.fillStyle(0x5d8659, 1);
  g.fillRect(2, 16, 9, 16); // arms
  g.fillRect(38, 16, 9, 16);
  g.fillRect(17, 3, 14, 12); // head
  g.fillStyle(0x22301f, 1);
  g.fillRect(20, 7, 3, 3);
  g.fillRect(26, 7, 3, 3);
  g.fillStyle(0x38513a, 1);
  g.fillRect(9, 24, 30, 3);
}

function drawArmored(g: Phaser.GameObjects.Graphics): void {
  g.fillStyle(0x333d45, 1);
  g.fillRect(10, 24, 6, 12);
  g.fillRect(20, 24, 6, 12);
  g.fillStyle(0x4c6350, 1);
  g.fillRect(8, 10, 20, 16);
  // Plates
  g.fillStyle(0x8d99a6, 1);
  g.fillRect(7, 12, 22, 5);
  g.fillRect(7, 19, 22, 5);
  g.fillStyle(0xb9c4cf, 1);
  g.fillRect(7, 12, 22, 1);
  g.fillStyle(0x6b8f63, 1);
  g.fillRect(12, 2, 12, 9);
  g.fillStyle(0x8d99a6, 1);
  g.fillRect(11, 1, 14, 4); // helmet plate
  g.fillStyle(0x1d2620, 1);
  g.fillRect(14, 7, 2, 2);
  g.fillRect(20, 7, 2, 2);
}

function drawSwarmer(g: Phaser.GameObjects.Graphics): void {
  g.fillStyle(0x5f8054, 1);
  g.fillRect(4, 7, 12, 10);
  g.fillStyle(0x76a066, 1);
  g.fillRect(6, 2, 8, 6);
  g.fillStyle(0x27321f, 1);
  g.fillRect(7, 4, 2, 2);
  g.fillRect(11, 4, 2, 2);
  g.fillStyle(0x5f8054, 1);
  g.fillRect(1, 9, 4, 3);
  g.fillRect(15, 9, 4, 3);
}

function drawSpitter(g: Phaser.GameObjects.Graphics): void {
  g.fillStyle(0x3d5240, 1);
  g.fillRect(9, 22, 5, 9);
  g.fillRect(17, 22, 5, 9);
  g.fillStyle(0x6a8a4e, 1);
  g.fillRect(8, 10, 15, 13);
  g.fillStyle(0xa8d05f, 0.85);
  g.fillRect(11, 13, 9, 7); // acid sac
  g.fillStyle(0x86a860, 1);
  g.fillRect(10, 2, 11, 9);
  g.fillStyle(0x2b3520, 1);
  g.fillRect(12, 5, 2, 2);
  g.fillRect(17, 5, 2, 2);
  g.fillStyle(0xa8d05f, 1);
  g.fillRect(14, 9, 4, 3); // mouth
}

function drawCrusher(g: Phaser.GameObjects.Graphics): void {
  g.fillStyle(0x2b3a2c, 1);
  g.fillRect(28, 86, 18, 26);
  g.fillRect(56, 86, 18, 26);
  g.fillStyle(0x44603f, 1);
  g.fillRect(18, 30, 66, 60);
  g.fillStyle(0x567a4c, 1);
  g.fillRect(2, 34, 18, 36);
  g.fillRect(82, 34, 18, 36);
  g.fillRect(34, 4, 34, 28);
  g.fillStyle(0x8d99a6, 1);
  g.fillRect(18, 46, 66, 8);
  g.fillRect(18, 62, 66, 8);
  g.fillStyle(0xff7a5a, 1);
  g.fillRect(40, 12, 6, 6);
  g.fillRect(56, 12, 6, 6);
  g.fillStyle(0x33472f, 1);
  g.fillRect(44, 24, 14, 5);
}

function drawAbomination(g: Phaser.GameObjects.Graphics): void {
  g.fillStyle(0x2f3f38, 1);
  g.fillRect(26, 74, 14, 22);
  g.fillRect(52, 74, 14, 22);
  g.fillStyle(0x4c6b52, 1);
  g.fillRect(14, 24, 64, 52);
  g.fillStyle(0x9fd06a, 0.8);
  g.fillRect(24, 34, 16, 14); // growths
  g.fillRect(50, 44, 18, 16);
  g.fillRect(34, 58, 14, 12);
  g.fillStyle(0x5f8459, 1);
  g.fillRect(2, 30, 14, 30);
  g.fillRect(76, 30, 14, 30);
  g.fillRect(32, 2, 28, 24);
  g.fillStyle(0xd9ff7a, 1);
  g.fillRect(38, 10, 6, 5);
  g.fillRect(50, 10, 6, 5);
}

/* ------------------------------------------------------------------ fx --- */

function drawDisc(g: Phaser.GameObjects.Graphics, radius: number): void {
  // Cheap radial falloff: concentric circles with decreasing alpha.
  const steps = 8;
  for (let i = steps; i >= 1; i--) {
    const t = i / steps;
    g.fillStyle(0xffffff, (1 - t) * 0.22 + 0.04);
    g.fillCircle(radius, radius, radius * t);
  }
  g.fillStyle(0xffffff, 0.85);
  g.fillCircle(radius, radius, radius * 0.28);
}

/* ----------------------------------------------------------------- lanes -- */

/** Frozen supply crate. Stretched to each block's size, so keep it simple. */
function drawIce(g: Phaser.GameObjects.Graphics): void {
  g.fillStyle(0x4bb4e6, 0.92);
  g.fillRect(0, 0, 128, 128);
  g.fillStyle(0x8fd8f7, 0.9);
  g.fillRect(8, 8, 112, 112);
  g.fillStyle(0xd6f2ff, 0.75);
  g.fillRect(8, 8, 112, 26);
  // Angled facets so the surface reads as ice, not glass.
  g.fillStyle(0xffffff, 0.30);
  g.fillTriangle(14, 120, 48, 12, 70, 12);
  g.fillTriangle(78, 120, 110, 12, 122, 40);
  g.fillStyle(0x2f8fc4, 0.35);
  g.fillTriangle(0, 128, 40, 128, 0, 74);
  g.lineStyle(7, 0xdff5ff, 1);
  g.strokeRect(4, 4, 120, 120);
  g.lineStyle(3, 0x2a7fb0, 0.8);
  g.strokeRect(10, 10, 108, 108);
}

/** Penalty barrier: hazard stripes, unmistakably "do not let this through". */
function drawBarrier(g: Phaser.GameObjects.Graphics): void {
  g.fillStyle(0xc4342f, 1);
  g.fillRect(0, 0, 128, 64);
  g.fillStyle(0xe8544c, 1);
  for (let i = -64; i < 128; i += 32) {
    g.fillTriangle(i, 64, i + 16, 64, i + 32, 0);
    g.fillTriangle(i, 64, i + 32, 0, i + 16, 0);
  }
  g.fillStyle(0x2a1012, 1);
  g.fillRect(0, 0, 128, 6);
  g.fillRect(0, 58, 128, 6);
  g.lineStyle(3, 0xffb0ac, 0.9);
  g.strokeRect(2, 2, 124, 60);
}

/** Asphalt tile for the scrolling bridge deck. */
function drawRoad(g: Phaser.GameObjects.Graphics): void {
  g.fillStyle(0x2c3442, 1);
  g.fillRect(0, 0, 128, 128);
  g.fillStyle(0x2f3846, 1);
  g.fillRect(0, 0, 128, 62);
  g.fillStyle(0x333c4c, 0.7);
  g.fillRect(0, 96, 128, 22);
  // A single soft seam - enough to read as movement, not a ladder.
  g.fillStyle(0x232b37, 0.55);
  g.fillRect(0, 125, 128, 3);
}

/**
 * Vertical sky gradient, baked once. Drawing this as banded fills every frame
 * is pure overdraw, which is exactly what fill-rate-bound mobile GPUs hate.
 */
function drawSky(g: Phaser.GameObjects.Graphics): void {
  const bands = 32;
  const top = Phaser.Display.Color.IntegerToColor(COLORS_BG_TOP);
  const bottom = Phaser.Display.Color.IntegerToColor(COLORS_BG_BOTTOM);
  for (let i = 0; i < bands; i++) {
    const t = i / (bands - 1);
    const c = Phaser.Display.Color.Interpolate.ColorWithColor(top, bottom, 1, t);
    g.fillStyle(Phaser.Display.Color.GetColor(c.r, c.g, c.b), 1);
    g.fillRect(0, (128 / bands) * i, 8, 128 / bands + 1);
  }
}

/** Generates every placeholder texture. Called once from BootScene. */
export function generateTextures(scene: Phaser.Scene): void {
  // Soldiers - one texture per tier silhouette.
  for (const tier of SOLDIER_TIERS) {
    makeTexture(scene, TEX.soldier(tier.visual), SOLDIER_W, SOLDIER_H, (g) =>
      drawSoldier(g, tier.visual, tier.bodyColor, tier.helmetColor, tier.weaponColor, tier.accentColor),
    );
  }

  makeTexture(scene, 'zombie_walker', 30, 30, drawWalker);
  makeTexture(scene, 'zombie_runner', 27, 28, drawRunner);
  makeTexture(scene, 'zombie_brute', 48, 52, drawBrute);
  makeTexture(scene, 'zombie_armored', 36, 36, drawArmored);
  makeTexture(scene, 'zombie_swarmer', 20, 17, drawSwarmer);
  makeTexture(scene, 'zombie_spitter', 31, 31, drawSpitter);
  makeTexture(scene, 'boss_crusher', 102, 112, drawCrusher);
  makeTexture(scene, 'boss_abomination', 92, 96, drawAbomination);

  makeTexture(scene, TEX.pixel, 4, 4, (g) => {
    g.fillStyle(0xffffff, 1);
    g.fillRect(0, 0, 4, 4);
  });

  makeTexture(scene, TEX.shadow, 32, 14, (g) => {
    g.fillStyle(0x000000, 0.28);
    g.fillEllipse(16, 7, 30, 12);
  });

  makeTexture(scene, TEX.tracer, 3, 22, (g) => {
    g.fillStyle(0xffffff, 0.25);
    g.fillRect(0, 0, 3, 22);
    g.fillStyle(0xffffff, 1);
    g.fillRect(1, 0, 1, 22);
  });

  makeTexture(scene, TEX.spark, 6, 6, (g) => {
    g.fillStyle(0xffffff, 1);
    g.fillRect(1, 0, 4, 6);
    g.fillRect(0, 1, 6, 4);
  });

  makeTexture(scene, TEX.disc, 96, 96, (g) => drawDisc(g, 48));

  makeTexture(scene, TEX.ring, 96, 96, (g) => {
    g.lineStyle(5, 0xffffff, 1);
    g.strokeCircle(48, 48, 43);
    g.lineStyle(2, 0xffffff, 0.5);
    g.strokeCircle(48, 48, 34);
  });

  makeTexture(scene, TEX.muzzle, 18, 18, (g) => {
    g.fillStyle(0xffffff, 0.95);
    g.fillCircle(9, 9, 4);
    g.fillStyle(0xffffff, 0.55);
    g.fillRect(8, 0, 2, 18);
    g.fillRect(0, 8, 18, 2);
  });

  makeTexture(scene, TEX.crate, 34, 34, (g) => {
    g.fillStyle(0x2c3a2c, 1);
    g.fillRect(1, 1, 32, 32);
    g.fillStyle(0x7fd4a2, 1);
    g.fillRect(1, 1, 32, 4);
    g.fillRect(1, 29, 32, 4);
    g.fillStyle(0x9be6bd, 1);
    g.fillRect(14, 5, 6, 24);
    g.lineStyle(2, 0x0f1218, 1);
    g.strokeRect(1, 1, 32, 32);
  });

  makeTexture(scene, TEX.spit, 14, 14, (g) => {
    g.fillStyle(0xa8d05f, 0.55);
    g.fillCircle(7, 7, 7);
    g.fillStyle(0xd9ff7a, 1);
    g.fillCircle(7, 7, 4);
  });

  makeTexture(scene, TEX.shield, 128, 128, (g) => {
    g.lineStyle(4, 0xffffff, 0.85);
    g.strokeCircle(64, 64, 60);
    g.lineStyle(10, 0xffffff, 0.18);
    g.strokeCircle(64, 64, 54);
  });

  makeTexture(scene, TEX.sky, 8, 128, drawSky);
  makeTexture(scene, TEX.ice, 128, 128, drawIce);
  makeTexture(scene, TEX.barrier, 128, 64, drawBarrier);
  makeTexture(scene, TEX.road, 128, 128, drawRoad);

  makeTexture(scene, TEX.star, 20, 20, (g) => {
    g.fillStyle(0xffffff, 1);
    g.fillTriangle(10, 0, 13, 8, 7, 8);
    g.fillTriangle(10, 20, 13, 12, 7, 12);
    g.fillTriangle(0, 10, 8, 13, 8, 7);
    g.fillTriangle(20, 10, 12, 13, 12, 7);
    g.fillCircle(10, 10, 4);
  });
}
