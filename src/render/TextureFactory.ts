import Phaser from 'phaser';
import { SOLDIER_TIERS } from '../data/soldierTiers';
import { MAX_WEAPON_LEVEL } from '../data/weaponTiers';

/**
 * All art is generated at runtime with Phaser Graphics.
 *
 * Why: zero image bytes in the bundle (a huge win for the Playables size
 * budget) and instant iteration. Every sprite is looked up by a stable texture
 * key, so swapping in real artwork later is a matter of loading an atlas in
 * BootScene and *not* calling the matching generator here - no gameplay code
 * references anything but the key.
 *
 * Art direction: a daylight bridge. Units are chunky, saturated shapes with a
 * lit side, a shaded side and a baked contact shadow, drawn to read against
 * pale concrete. No gore.
 */

export const TEX = {
  /** Soldier of a given tier holding a given weapon tier. */
  soldier: (visual: number, weapon: number) => `soldier_t${visual}_w${weapon}`,
  /** Neon weapon glyph shown inside a supply crate. */
  weaponIcon: (weapon: number) => `weapon_icon_${weapon}`,
  tracer: 'fx_tracer',
  spark: 'fx_spark',
  disc: 'fx_disc',
  ring: 'fx_ring',
  muzzle: 'fx_muzzle',
  spit: 'fx_spit',
  shield: 'fx_shield',
  star: 'fx_star',
  pixel: 'fx_pixel',
  ice: 'lane_ice',
  barrier: 'lane_barrier',
  glow: 'fx_glow',
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

/**
 * Contact shadow baked into the bottom of a unit sprite.
 *
 * Every unit needs one, and a separate shadow object per unit would be up to
 * 150 extra quads a frame for a few pixels of darkening. Baked in it costs
 * nothing, scales with the sprite's perspective scale for free, and cannot be
 * switched off by a quality drop - a floating horde looks broken at any
 * quality. Offset left, because the sun is up and to the right.
 */
function bakeContactShadow(
  g: Phaser.GameObjects.Graphics,
  cx: number,
  y: number,
  width: number,
): void {
  g.fillStyle(0x2b3340, 0.2);
  g.fillEllipse(cx - width * 0.16, y, width * 1.15, width * 0.4);
  g.fillStyle(0x232b38, 0.3);
  g.fillEllipse(cx - width * 0.1, y, width * 0.7, width * 0.26);
}

/* -------------------------------------------------------------- soldiers -- */

const SOLDIER_W = 46;
const SOLDIER_H = 66;

/**
 * A soldier seen from behind and slightly above: boots, blue fatigues, a dark
 * plate carrier, a helmet, and the weapon of the current weapon tier held up
 * and forward.
 */
function drawSoldier(
  g: Phaser.GameObjects.Graphics,
  visual: number,
  weapon: number,
  body: number,
  helmet: number,
  gunColor: number,
  accent: number,
): void {
  const cx = SOLDIER_W / 2;
  const vest = shade(body, 0.42);
  const vestLit = shade(body, 0.62);
  const bodyLit = shade(body, 1.28);
  const bodyDark = shade(body, 0.72);

  bakeContactShadow(g, cx, 60, 26);

  // Boots
  g.fillStyle(0x2a2119, 1);
  g.fillRect(cx - 11, 50, 9, 8);
  g.fillRect(cx + 2, 50, 9, 8);
  g.fillStyle(0x40332a, 1);
  g.fillRect(cx - 11, 50, 9, 2);
  g.fillRect(cx + 2, 50, 9, 2);

  // Legs
  g.fillStyle(body, 1);
  g.fillRect(cx - 10, 35, 8, 16);
  g.fillRect(cx + 2, 35, 8, 16);
  g.fillStyle(bodyDark, 1);
  g.fillRect(cx + 8, 35, 2, 16);
  g.fillStyle(bodyLit, 1);
  g.fillRect(cx - 10, 35, 2, 16);

  // Belt
  g.fillStyle(0x241f1a, 1);
  g.fillRect(cx - 11, 32, 22, 5);
  g.fillStyle(accent, 0.7);
  g.fillRect(cx - 4, 33, 8, 3);

  // Arms (fatigues), reaching forward around the weapon
  g.fillStyle(body, 1);
  g.fillRect(cx - 15, 20, 6, 14);
  g.fillRect(cx + 9, 18, 6, 14);
  g.fillStyle(bodyLit, 1);
  g.fillRect(cx - 15, 20, 2, 14);

  // Plate carrier
  g.fillStyle(vest, 1);
  g.fillRect(cx - 11, 16, 22, 18);
  g.fillStyle(vestLit, 1);
  g.fillRect(cx - 11, 16, 3, 18);
  g.fillStyle(shade(body, 0.3), 1);
  g.fillRect(cx + 8, 16, 3, 18);

  // Pack and webbing - detail grows with tier
  g.fillStyle(shade(body, 0.5), 1);
  g.fillRect(cx - 8, 19, 16, 11);
  g.fillStyle(accent, 0.85);
  g.fillRect(cx - 8, 22, 16, 2);
  if (visual >= 2) {
    g.fillStyle(accent, 0.7);
    g.fillRect(cx - 8, 27, 16, 2);
  }
  if (visual >= 4) {
    g.fillStyle(accent, 0.9);
    g.fillRect(cx - 1, 19, 2, 11);
  }

  // Shoulders
  g.fillStyle(vestLit, 1);
  g.fillRect(cx - 14, 15, 28, 4);
  g.fillStyle(shade(body, 0.34), 1);
  g.fillRect(cx - 14, 18, 28, 2);

  // Neck and head
  g.fillStyle(0xc79a72, 1);
  g.fillRect(cx - 4, 11, 8, 6);

  // Helmet
  g.fillStyle(helmet, 1);
  g.fillRect(cx - 8, 4, 16, 9);
  g.fillStyle(shade(helmet, 2.1), 1);
  g.fillRect(cx - 8, 4, 16, 3);
  g.fillStyle(shade(helmet, 1.5), 1);
  g.fillRect(cx - 8, 4, 4, 9);
  g.fillStyle(shade(helmet, 0.6), 1);
  g.fillRect(cx - 8, 11, 16, 2);
  g.fillStyle(accent, 0.9);
  if (visual >= 1) g.fillRect(cx + 4, 6, 3, 4);
  if (visual >= 3) {
    g.fillStyle(0x1a1d24, 1);
    g.fillRect(cx - 8, 10, 16, 3); // balaclava / neck guard
  }
  if (visual >= 5) {
    g.fillStyle(accent, 0.95);
    g.fillRect(cx - 9, 4, 2, 7);
    g.fillRect(cx + 7, 4, 2, 7);
  }

  drawHeldWeapon(g, cx + 13, weapon, gunColor, accent);
}

/**
 * The weapon in a soldier's hands, pointing up-field.
 *
 * `x` is the barrel centre. Each tier is a clearly different silhouette -
 * longer, thicker, more hardware - so a weapon upgrade is legible at sprite
 * size without reading a single number.
 */
function drawHeldWeapon(
  g: Phaser.GameObjects.Graphics,
  x: number,
  weapon: number,
  gunColor: number,
  accent: number,
): void {
  const rim = shade(gunColor, 2.6);

  /**
   * Every part is drawn twice: a light rim first, the dark body inside it.
   * Without that outline the gun is dark navy on a dark navy vest and reads as
   * a backpack rather than a weapon.
   */
  const part = (px: number, py: number, w: number, h: number, colour = gunColor) => {
    g.fillStyle(rim, 0.95);
    g.fillRect(px - 1, py - 1, w + 2, h + 2);
    g.fillStyle(colour, 1);
    g.fillRect(px, py, w, h);
  };

  const barrelTop = [6, 5, 3, 2, 1, 1][weapon] ?? 6;
  const barrelW = [4, 4, 5, 5, 6, 8][weapon] ?? 4;

  // Barrel, running up past the shoulder, with a hot muzzle tip.
  part(x - barrelW / 2, barrelTop, barrelW, 21 - barrelTop);
  g.fillStyle(accent, 0.95);
  g.fillRect(x - barrelW / 2, barrelTop, barrelW, 3);

  // Receiver and grip
  part(x - 5, 21, 11, 10);
  part(x - 4, 30, 5, 6);

  switch (weapon) {
    case 0:
      break;
    case 1:
      part(x - 7, 27, 6, 9); // magazine
      break;
    case 2:
      part(x - 8, 27, 7, 10);
      part(x - 4, 15, 9, 4); // optic
      break;
    case 3:
      part(x - 9, 26, 10, 12); // drum
      part(x - 5, 12, 11, 4);
      break;
    case 4:
      part(x - 10, 25, 12, 14); // box mag
      part(x - 7, 9, 14, 4);
      part(x - 6, 1, 3, 9); // bipod
      part(x + 4, 1, 3, 9);
      break;
    default:
      // Minigun: a barrel cluster and a heavy housing.
      part(x - 11, 20, 15, 16);
      for (let i = 0; i < 4; i++) {
        part(x - 8 + i * 4, 1, 3, 20, i % 2 === 0 ? gunColor : shade(gunColor, 1.8));
      }
      g.fillStyle(accent, 0.95);
      g.fillRect(x - 11, 20, 15, 3);
      break;
  }
}

/** Neon glyph of a weapon tier, shown inside the crate that grants it. */
function drawWeaponIcon(g: Phaser.GameObjects.Graphics, weapon: number): void {
  const green = 0x7dff8f;
  const w = 84;
  const h = 40;
  const midY = h / 2;

  g.fillStyle(green, 0.16);
  g.fillRoundedRect(2, 4, w - 4, h - 8, 6);

  const bar = (x: number, y: number, bw: number, bh: number, alpha = 1) => {
    g.fillStyle(green, alpha);
    g.fillRect(x, y, bw, bh);
  };

  // Common body: stock, receiver, barrel running left to right.
  bar(8, midY - 3, 16, 7);
  bar(22, midY - 5, 26, 11);
  bar(46, midY - 3, 24 + weapon * 2, 6);

  switch (weapon) {
    case 0:
      bar(30, midY + 6, 5, 8);
      break;
    case 1:
      bar(30, midY + 6, 7, 12);
      break;
    case 2:
      bar(30, midY + 6, 7, 13);
      bar(30, midY - 12, 16, 5); // optic
      break;
    case 3:
      g.fillStyle(green, 1);
      g.fillCircle(35, midY + 12, 8); // drum
      bar(28, midY - 11, 20, 4);
      break;
    case 4:
      bar(28, midY + 6, 16, 14); // box mag
      bar(62, midY + 5, 4, 11); // bipod
      bar(70, midY + 5, 4, 11);
      break;
    default:
      for (let i = 0; i < 4; i++) bar(46, midY - 9 + i * 5, 30, 3);
      g.fillStyle(green, 1);
      g.fillCircle(30, midY, 10);
      break;
  }
}

/* --------------------------------------------------------------- zombies -- */

const ZOMBIE_SKIN = 0x9db396;
const ZOMBIE_SKIN_LIT = 0xc3d6b8;

/**
 * Shared zombie body plan.
 *
 * They walk *toward* the camera, so the arms reach forward and downward: from
 * the shoulder they read as short foreshortened stubs hanging over the torso,
 * not as slabs sticking out sideways. Everything gets a lit left edge and a
 * shaded right one, because the sun is up and to the right - that single
 * convention is what stops a 180-strong horde from turning into flat mush.
 */
function drawZombieBody(
  g: Phaser.GameObjects.Graphics,
  cx: number,
  scale: number,
  cloth: number,
  skin: number,
): void {
  const s = (v: number) => v * scale;
  const clothLit = shade(cloth, 1.32);
  const clothDark = shade(cloth, 0.62);
  const skinLit = shade(skin, 1.2);
  const skinDark = shade(skin, 0.68);
  const trouser = shade(cloth, 0.5);

  // Legs, mid-stride.
  g.fillStyle(trouser, 1);
  g.fillRect(cx - s(8), s(34), s(7), s(14));
  g.fillRect(cx + s(1), s(36), s(7), s(12));
  g.fillStyle(shade(trouser, 1.25), 1);
  g.fillRect(cx - s(8), s(34), s(2), s(14));
  // Boots
  g.fillStyle(0x2c2620, 1);
  g.fillRect(cx - s(8), s(45), s(7), s(4));
  g.fillRect(cx + s(1), s(45), s(7), s(4));

  // Torso, slightly hunched: shoulders wider than the waist.
  g.fillStyle(cloth, 1);
  g.fillRect(cx - s(10), s(16), s(20), s(19));
  g.fillStyle(clothLit, 1);
  g.fillRect(cx - s(10), s(16), s(4), s(19));
  g.fillStyle(clothDark, 1);
  g.fillRect(cx + s(7), s(16), s(3), s(19));
  // Shoulder line
  g.fillStyle(clothLit, 1);
  g.fillRect(cx - s(11), s(15), s(22), s(4));
  // Torn hem, with a patch of skin showing through
  g.fillStyle(clothDark, 1);
  g.fillRect(cx - s(10), s(32), s(6), s(4));
  g.fillRect(cx + s(3), s(33), s(7), s(3));
  g.fillStyle(skinDark, 1);
  g.fillRect(cx - s(2), s(28), s(5), s(6));

  // Arms: sleeve at the shoulder, bare forearm hanging forward.
  g.fillStyle(cloth, 1);
  g.fillRect(cx - s(14), s(17), s(5), s(9));
  g.fillRect(cx + s(9), s(19), s(5), s(9));
  g.fillStyle(skin, 1);
  g.fillRect(cx - s(14), s(25), s(5), s(11));
  g.fillRect(cx + s(9), s(27), s(5), s(10));
  g.fillStyle(skinLit, 1);
  g.fillRect(cx - s(14), s(25), s(2), s(11));
  // Hands
  g.fillStyle(skinDark, 1);
  g.fillRect(cx - s(15), s(35), s(7), s(4));
  g.fillRect(cx + s(9), s(36), s(6), s(4));

  // Neck and head
  g.fillStyle(skinDark, 1);
  g.fillRect(cx - s(3), s(13), s(6), s(4));
  g.fillStyle(skin, 1);
  g.fillRect(cx - s(6), s(4), s(12), s(10));
  g.fillStyle(skinLit, 1);
  g.fillRect(cx - s(6), s(4), s(4), s(10));
  // Jaw, hanging open
  g.fillStyle(skinDark, 1);
  g.fillRect(cx - s(4), s(13), s(8), s(3));
  // Hair
  g.fillStyle(shade(cloth, 0.4), 1);
  g.fillRect(cx - s(6), s(3), s(12), s(3));
  // Sunken eyes and mouth
  g.fillStyle(0x2b2f26, 1);
  g.fillRect(cx - s(4), s(7), s(3), s(3));
  g.fillRect(cx + s(1), s(7), s(3), s(3));
  g.fillStyle(0x53303a, 1);
  g.fillRect(cx - s(3), s(11), s(6), s(3));
}

function drawWalker(g: Phaser.GameObjects.Graphics): void {
  bakeContactShadow(g, 18, 51, 20);
  drawZombieBody(g, 18, 1, 0x5f6455, ZOMBIE_SKIN);
}

function drawRunner(g: Phaser.GameObjects.Graphics): void {
  bakeContactShadow(g, 17, 48, 19);
  drawZombieBody(g, 17, 0.94, 0x4f6166, ZOMBIE_SKIN_LIT);
  // A torn red band, so "the fast one" is legible at a glance.
  g.fillStyle(0xc4564a, 1);
  g.fillRect(8, 19, 18, 4);
}

function drawArmored(g: Phaser.GameObjects.Graphics): void {
  bakeContactShadow(g, 21, 55, 23);
  drawZombieBody(g, 21, 1.08, 0x4b5460, ZOMBIE_SKIN);
  // Riot plates strapped over the chest.
  g.fillStyle(0x8e9aa6, 1);
  g.fillRect(10, 18, 23, 8);
  g.fillRect(10, 28, 23, 7);
  g.fillStyle(0xc7d2dd, 1);
  g.fillRect(10, 18, 23, 2);
  g.fillRect(10, 28, 23, 2);
  g.fillStyle(0x646f7b, 1);
  g.fillRect(13, 2, 17, 7); // helmet
  g.fillStyle(0xaeb9c4, 1);
  g.fillRect(13, 2, 17, 2);
  g.fillStyle(0x2b323a, 0.75);
  g.fillRect(13, 8, 17, 4); // visor
}

function drawSwarmer(g: Phaser.GameObjects.Graphics): void {
  bakeContactShadow(g, 13, 38, 14);
  drawZombieBody(g, 13, 0.72, 0x6d6a52, ZOMBIE_SKIN_LIT);
}

function drawSpitter(g: Phaser.GameObjects.Graphics): void {
  bakeContactShadow(g, 18, 51, 20);
  drawZombieBody(g, 18, 1, 0x5f6b45, 0xa9c081);
  // Swollen acid sac on the chest.
  g.fillStyle(0xb9e05f, 0.9);
  g.fillRect(12, 21, 12, 9);
  g.fillStyle(0xe4ff8a, 0.9);
  g.fillRect(12, 21, 12, 3);
}

/** A brute: same plan, twice the mass, heavy apron and a bare head. */
function drawHeavy(
  g: Phaser.GameObjects.Graphics,
  cx: number,
  scale: number,
  apron: number,
  skin: number,
): void {
  const s = (v: number) => v * scale;
  const apronLit = shade(apron, 1.28);
  const apronDark = shade(apron, 0.62);

  // Legs
  g.fillStyle(0x453a2c, 1);
  g.fillRect(cx - s(16), s(64), s(14), s(24));
  g.fillRect(cx + s(2), s(66), s(14), s(22));
  g.fillStyle(0x27211a, 1);
  g.fillRect(cx - s(16), s(83), s(14), s(6));
  g.fillRect(cx + s(2), s(83), s(14), s(6));

  // Bare torso under a butcher's apron
  g.fillStyle(skin, 1);
  g.fillRect(cx - s(22), s(26), s(44), s(40));
  g.fillStyle(shade(skin, 1.18), 1);
  g.fillRect(cx - s(22), s(26), s(8), s(40));
  g.fillStyle(apron, 1);
  g.fillRect(cx - s(16), s(34), s(32), s(38));
  g.fillStyle(apronLit, 1);
  g.fillRect(cx - s(16), s(34), s(6), s(38));
  g.fillStyle(apronDark, 1);
  g.fillRect(cx - s(16), s(64), s(32), s(8));
  // Apron straps
  g.fillStyle(apronDark, 1);
  g.fillRect(cx - s(12), s(26), s(5), s(10));
  g.fillRect(cx + s(7), s(26), s(5), s(10));

  // Arms
  g.fillStyle(skin, 1);
  g.fillRect(cx - s(32), s(30), s(11), s(34));
  g.fillRect(cx + s(21), s(32), s(11), s(32));
  g.fillStyle(shade(skin, 1.2), 1);
  g.fillRect(cx - s(32), s(30), s(4), s(34));
  g.fillStyle(shade(skin, 0.7), 1);
  g.fillRect(cx - s(33), s(60), s(13), s(7));
  g.fillRect(cx + s(21), s(60), s(12), s(7));

  // Head, sunk into the shoulders
  g.fillStyle(skin, 1);
  g.fillRect(cx - s(12), s(4), s(24), s(24));
  g.fillStyle(shade(skin, 1.2), 1);
  g.fillRect(cx - s(12), s(4), s(8), s(24));
  g.fillStyle(0xa93c30, 1);
  g.fillRect(cx - s(8), s(12), s(6), s(5));
  g.fillRect(cx + s(3), s(12), s(6), s(5));
  g.fillStyle(0x3d1c18, 1);
  g.fillRect(cx - s(7), s(21), s(14), s(5));
  g.fillStyle(shade(skin, 0.72), 1);
  g.fillRect(cx - s(12), s(25), s(24), s(4));
}

function drawBrute(g: Phaser.GameObjects.Graphics): void {
  bakeContactShadow(g, 33, 76, 38);
  drawHeavy(g, 33, 0.85, 0x8a7460, 0xb08b74);
}

function drawCrusher(g: Phaser.GameObjects.Graphics): void {
  bakeContactShadow(g, 60, 138, 74);
  drawHeavy(g, 60, 1.5, 0x7d6c58, 0xb98f74);
  // Riveted plate over one shoulder marks it out as the boss.
  g.fillStyle(0x8b96a2, 1);
  g.fillRect(14, 44, 30, 16);
  g.fillStyle(0xc3ced9, 1);
  g.fillRect(14, 44, 30, 4);
}

function drawAbomination(g: Phaser.GameObjects.Graphics): void {
  bakeContactShadow(g, 54, 122, 68);
  drawHeavy(g, 54, 1.32, 0x5d7049, 0x89a76a);
  // Bulging growths, the thing the phase transitions are named after.
  g.fillStyle(0xb4d47c, 0.9);
  g.fillRect(20, 46, 22, 20);
  g.fillRect(62, 60, 24, 22);
  g.fillRect(40, 78, 18, 16);
  g.fillStyle(0xd9ff9a, 0.9);
  g.fillRect(20, 46, 22, 5);
  g.fillRect(62, 60, 24, 5);
}

/* ------------------------------------------------------------------ fx --- */

function drawDisc(g: Phaser.GameObjects.Graphics, radius: number): void {
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

/**
 * Frozen supply crate: bright glassy cyan with a heavy frost rim, so it stays
 * a solid readable block against pale concrete. Stretched to each crate's
 * size, so no detail may depend on the aspect ratio.
 */
function drawIce(g: Phaser.GameObjects.Graphics): void {
  g.fillStyle(0x1d9fd4, 1);
  g.fillRect(0, 0, 128, 128);
  g.fillStyle(0x53c8f2, 1);
  g.fillRect(5, 5, 118, 118);
  g.fillStyle(0x9fe4fb, 0.9);
  g.fillRect(5, 5, 118, 30);
  g.fillStyle(0x2a7fb0, 0.55);
  g.fillRect(5, 104, 118, 19);
  // Facets
  g.fillStyle(0xffffff, 0.34);
  g.fillTriangle(16, 122, 52, 8, 76, 8);
  g.fillTriangle(84, 122, 114, 8, 124, 44);
  g.fillStyle(0x1a6f9c, 0.3);
  g.fillTriangle(0, 128, 44, 128, 0, 70);
  // Frost rim
  g.fillStyle(0xe8f9ff, 1);
  g.fillRect(0, 0, 128, 7);
  g.fillRect(0, 121, 128, 7);
  g.fillRect(0, 0, 7, 128);
  g.fillRect(121, 0, 7, 128);
  g.lineStyle(3, 0x2a7fb0, 0.8);
  g.strokeRect(9, 9, 110, 110);
}

/**
 * Penalty barrier: a hot red gate with a glowing base and heavy posts. It has
 * to read as "stop this" from the far end of the bridge.
 */
function drawBarrier(g: Phaser.GameObjects.Graphics): void {
  g.fillStyle(0xd1332c, 1);
  g.fillRect(0, 0, 128, 64);
  g.fillStyle(0xf05a48, 1);
  g.fillRect(6, 6, 116, 40);
  g.fillStyle(0xff8a5c, 0.9);
  g.fillRect(6, 6, 116, 10);
  // Hot glow along the bottom edge.
  for (let i = 0; i < 6; i++) {
    g.fillStyle(0xffc46a, 0.14 + i * 0.08);
    g.fillRect(6, 46 + i * 2, 116, 3);
  }
  // Posts
  g.fillStyle(0x8f1f1c, 1);
  g.fillRect(0, 0, 10, 64);
  g.fillRect(118, 0, 10, 64);
  g.fillStyle(0xffb0a4, 0.85);
  g.fillRect(0, 0, 10, 4);
  g.fillRect(118, 0, 10, 4);
  g.lineStyle(3, 0xffd6cc, 0.9);
  g.strokeRect(3, 3, 122, 58);
}

/** Soft radial light, used for muzzle glow and the lit apron under the army. */
function drawGlow(g: Phaser.GameObjects.Graphics): void {
  const steps = 14;
  for (let i = steps; i >= 1; i--) {
    const t = i / steps;
    g.fillStyle(0xffffff, 0.055 * (1 - t) + 0.012);
    g.fillCircle(64, 64, 62 * t);
  }
}

/** Multiplies a packed colour's brightness, clamped per channel. */
function shade(color: number, factor: number): number {
  const clampByte = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v | 0);
  return Phaser.Display.Color.GetColor(
    clampByte(((color >> 16) & 0xff) * factor),
    clampByte(((color >> 8) & 0xff) * factor),
    clampByte((color & 0xff) * factor),
  );
}

/**
 * Generates every texture. Called once from BootScene.
 *
 * Soldier sprites are the cross product of tier and weapon level, which is why
 * they are generated lazily by `ensureSoldierTexture` instead of all up front:
 * a run only ever shows a handful of the combinations.
 */
export function generateTextures(scene: Phaser.Scene): void {
  for (const tier of SOLDIER_TIERS) ensureSoldierTexture(scene, tier.visual, 0);

  for (let weapon = 0; weapon <= MAX_WEAPON_LEVEL; weapon++) {
    makeTexture(scene, TEX.weaponIcon(weapon), 84, 40, (g) => drawWeaponIcon(g, weapon));
  }

  // Heights include the baked contact shadow at the bottom of each sprite.
  makeTexture(scene, 'zombie_walker', 36, 55, drawWalker);
  makeTexture(scene, 'zombie_runner', 34, 52, drawRunner);
  makeTexture(scene, 'zombie_brute', 66, 80, drawBrute);
  makeTexture(scene, 'zombie_armored', 42, 59, drawArmored);
  makeTexture(scene, 'zombie_swarmer', 26, 41, drawSwarmer);
  makeTexture(scene, 'zombie_spitter', 36, 55, drawSpitter);
  makeTexture(scene, 'boss_crusher', 120, 142, drawCrusher);
  makeTexture(scene, 'boss_abomination', 108, 126, drawAbomination);

  makeTexture(scene, TEX.pixel, 4, 4, (g) => {
    g.fillStyle(0xffffff, 1);
    g.fillRect(0, 0, 4, 4);
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

  makeTexture(scene, TEX.muzzle, 24, 24, (g) => {
    g.fillStyle(0xffffff, 0.95);
    g.fillCircle(12, 12, 5);
    g.fillStyle(0xffffff, 0.6);
    g.fillRect(10, 0, 4, 24);
    g.fillRect(0, 10, 24, 4);
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

  makeTexture(scene, TEX.ice, 128, 128, drawIce);
  makeTexture(scene, TEX.barrier, 128, 64, drawBarrier);
  makeTexture(scene, TEX.glow, 128, 128, drawGlow);

  makeTexture(scene, TEX.star, 20, 20, (g) => {
    g.fillStyle(0xffffff, 1);
    g.fillTriangle(10, 0, 13, 8, 7, 8);
    g.fillTriangle(10, 20, 13, 12, 7, 12);
    g.fillTriangle(0, 10, 8, 13, 8, 7);
    g.fillTriangle(20, 10, 12, 13, 12, 7);
    g.fillCircle(10, 10, 4);
  });
}

/** Generates one tier/weapon soldier sprite on demand. Idempotent. */
export function ensureSoldierTexture(
  scene: Phaser.Scene,
  visual: number,
  weapon: number,
): string {
  const key = TEX.soldier(visual, weapon);
  const tier = SOLDIER_TIERS[Math.min(visual, SOLDIER_TIERS.length - 1)];
  makeTexture(scene, key, SOLDIER_W, SOLDIER_H, (g) =>
    drawSoldier(g, visual, weapon, tier.bodyColor, tier.helmetColor, tier.weaponColor, tier.accentColor),
  );
  return key;
}
