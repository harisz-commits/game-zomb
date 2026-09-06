import type { Box } from './BoxModel';
import { mergeBoxes, shade } from './BoxModel';
import type * as THREE from 'three';

/**
 * Every model in the game, built from boxes.
 *
 * Units are "model units", roughly decimetres: a soldier is about 12 tall.
 * `Stage` maps the game's world units onto these.
 */

export interface SoldierLook {
  body: number;
  vest: number;
  helmet: number;
  accent: number;
  gun: number;
}

export interface ZombieLook {
  skin: number;
  cloth: number;
  /** Riot plates and a visored helmet. */
  armored?: boolean;
  /** A torn red band, so "the fast one" reads at a glance. */
  band?: boolean;
}

/* ------------------------------------------------------------------ heads */

/**
 * A zombie head that actually reads as a face.
 *
 * The sunken eyes do the work: two dark boxes pushed into the skull with a
 * brow ridge standing proud over them catch a shadow, and that shadow is what
 * turns a box into a skull. The hanging jaw and the strip of teeth finish it.
 */
function zombieHead(y: number, skin: number, dark: number): Box[] {
  return [
    { p: [0, y + 0.35, 0], s: [1.85, 1.7, 1.75], c: skin },
    { p: [0, y + 1.25, -0.1], s: [1.6, 0.4, 1.5], c: shade(skin, 0.88) },
    { p: [0, y + 0.62, 0.95], s: [1.9, 0.34, 0.3], c: shade(skin, 1.12) },
    { p: [-0.42, y + 0.3, 0.8], s: [0.55, 0.5, 0.22], c: dark },
    { p: [0.42, y + 0.3, 0.8], s: [0.55, 0.5, 0.22], c: dark },
    { p: [-0.78, y - 0.05, 0.72], s: [0.36, 0.45, 0.28], c: shade(skin, 1.1) },
    { p: [0.78, y - 0.05, 0.72], s: [0.36, 0.45, 0.28], c: shade(skin, 1.1) },
    { p: [0, y + 0.05, 0.95], s: [0.3, 0.4, 0.22], c: shade(skin, 1.06) },
    { p: [0, y - 0.55, 0.7], s: [1.0, 0.45, 0.5], c: dark },
    { p: [0, y - 0.95, 0.6], s: [1.25, 0.45, 0.85], c: shade(skin, 0.9), r: [0.22, 0, 0] },
    { p: [0, y - 0.72, 0.92], s: [0.9, 0.16, 0.14], c: 0xd8d2be },
  ];
}

function soldierHead(y: number, skin: number, helmet: number, accent: number): Box[] {
  return [
    { p: [0, y, 0], s: [1.55, 1.5, 1.55], c: skin },
    { p: [0, y - 0.15, 0.72], s: [1.2, 0.9, 0.2], c: shade(skin, 0.82) },
    { p: [0, y + 1.0, 0], s: [1.95, 0.95, 1.95], c: helmet },
    { p: [0, y + 0.62, 0.55], s: [1.8, 0.35, 0.95], c: shade(helmet, 1.25) },
    { p: [0, y + 0.62, -0.8], s: [1.75, 0.4, 0.5], c: shade(helmet, 0.75) },
    { p: [0, y + 1.5, 0], s: [1.3, 0.25, 1.4], c: shade(helmet, 1.5) },
    { p: [0.95, y + 0.75, 0.1], s: [0.35, 0.5, 0.6], c: accent },
    { p: [0, y - 0.7, 0.35], s: [1.3, 0.22, 1.1], c: shade(helmet, 0.6) },
  ];
}

/* ---------------------------------------------------------------- weapons */

/** One entry per weapon tier - the silhouettes the ladder is judged on. */
const GUNS = [
  { len: 3.4, gauge: 0.3, mag: 0.9, optic: false, drum: false, barrels: 1 },
  { len: 3.9, gauge: 0.32, mag: 1.2, optic: false, drum: false, barrels: 1 },
  { len: 4.4, gauge: 0.36, mag: 1.4, optic: true, drum: false, barrels: 1 },
  { len: 4.8, gauge: 0.4, mag: 1.0, optic: true, drum: true, barrels: 1 },
  { len: 5.4, gauge: 0.46, mag: 1.8, optic: true, drum: false, barrels: 1 },
  { len: 5.6, gauge: 0.34, mag: 1.6, optic: false, drum: false, barrels: 4 },
];

export const WEAPON_MODEL_COUNT = GUNS.length;

function weaponBoxes(
  x: number,
  y: number,
  z: number,
  level: number,
  gun: number,
  accent: number,
): Box[] {
  const spec = GUNS[Math.max(0, Math.min(level, GUNS.length - 1))];
  const out: Box[] = [
    { p: [x, y, z + 0.9], s: [0.75, 0.7, 1.7], c: gun },
    { p: [x, y - 0.45, z + 1.5], s: [0.4, 0.9, 0.5], c: gun, r: [0.3, 0, 0] },
    { p: [x, y - 0.05, z + 2.3], s: [0.55, 0.55, 1.1], c: 0x33291f },
  ];
  if (spec.barrels === 1) {
    out.push({ p: [x, y + 0.1, z - spec.len / 2], s: [spec.gauge, spec.gauge, spec.len], c: gun });
    out.push({
      p: [x, y + 0.1, z - spec.len],
      s: [spec.gauge * 1.6, spec.gauge * 1.6, 0.35],
      c: accent,
    });
  } else {
    for (let i = 0; i < spec.barrels; i++) {
      const a = (i / spec.barrels) * Math.PI * 2;
      out.push({
        p: [x + Math.cos(a) * 0.32, y + 0.1 + Math.sin(a) * 0.32, z - spec.len / 2],
        s: [spec.gauge, spec.gauge, spec.len],
        c: i % 2 ? 0x9aa6b4 : gun,
      });
    }
    out.push({ p: [x, y + 0.1, z + 0.2], s: [1.6, 1.6, 1.8], c: gun });
    out.push({ p: [x, y + 0.1, z - spec.len * 0.45], s: [1.2, 1.2, 0.5], c: 0x6c7684 });
  }
  if (spec.drum) out.push({ p: [x, y - 0.85, z + 0.7], s: [1.3, 1.3, 0.6], c: gun });
  else out.push({ p: [x, y - 0.75, z + 0.9], s: [0.5, spec.mag, 0.75], c: gun });
  if (spec.optic) out.push({ p: [x, y + 0.65, z + 0.5], s: [0.4, 0.4, 1.1], c: 0x1d2129 });
  return out;
}

/* --------------------------------------------------------------- soldiers */

/** Hip height: where the leg meshes pivot. */
export const SOLDIER_HIP_Y = 4.2;
export const SOLDIER_LEG_X = 0.8;
/** Ground-to-helmet height, used to scale the model into world units. */
export const SOLDIER_HEIGHT = 13.6;

export function soldierBody(look: SoldierLook, weaponLevel: number): THREE.BufferGeometry {
  const { body, vest, helmet, accent, gun } = look;
  return mergeBoxes([
    { p: [0, 4.1, 0], s: [2.5, 0.8, 1.6], c: 0x2c241c },
    { p: [0, 4.2, 0.8], s: [0.9, 0.5, 0.3], c: accent },
    { p: [0, 6.0, 0], s: [2.9, 3.1, 1.9], c: body },
    { p: [0, 6.1, 0.35], s: [3.1, 2.8, 1.5], c: vest },
    { p: [0, 6.1, -0.55], s: [2.6, 2.6, 1.2], c: shade(vest, 0.8) },
    { p: [-0.75, 6.4, 1.1], s: [0.4, 2.3, 0.25], c: shade(vest, 1.5) },
    { p: [0.75, 6.4, 1.1], s: [0.4, 2.3, 0.25], c: shade(vest, 1.5) },
    { p: [0, 5.05, 1.05], s: [1.5, 0.8, 0.4], c: accent },
    { p: [0, 6.4, -1.35], s: [2.3, 2.5, 1.0], c: shade(body, 0.72) },
    { p: [0, 5.8, -1.9], s: [1.6, 0.9, 0.35], c: accent },
    { p: [-1.75, 7.4, 0], s: [1.0, 1.0, 1.8], c: shade(body, 1.2) },
    { p: [1.75, 7.4, 0], s: [1.0, 1.0, 1.8], c: shade(body, 1.2) },
    { p: [-1.85, 6.0, 0.65], s: [0.9, 2.6, 0.95], c: body },
    { p: [1.85, 6.2, 0.65], s: [0.9, 2.4, 0.95], c: body },
    { p: [-1.85, 4.85, 1.25], s: [0.85, 0.75, 1.05], c: 0x33291f },
    { p: [1.85, 5.15, 1.25], s: [0.85, 0.75, 1.05], c: 0x33291f },
    ...soldierHead(8.85, 0xc79a72, helmet, accent),
    ...weaponBoxes(1.6, 5.9, -0.9, weaponLevel, gun, accent),
  ]);
}

export function soldierLeg(look: SoldierLook): THREE.BufferGeometry {
  return mergeBoxes([
    { p: [0, -1.5, 0], s: [1.1, 3.3, 1.1], c: look.body },
    { p: [0, -1.5, 0.15], s: [1.2, 0.6, 1.2], c: shade(look.body, 0.7) },
    { p: [0, -3.5, 0.2], s: [1.2, 0.9, 1.8], c: 0x2a2119 },
    { p: [0, -3.85, 0.25], s: [1.25, 0.35, 1.9], c: 0x1a140f },
  ]);
}

/* ---------------------------------------------------------------- zombies */

export const ZOMBIE_HIP_Y = 4.0;
export const ZOMBIE_LEG_X = 0.8;
export const ZOMBIE_HEIGHT = 13.0;

export function zombieBody(look: ZombieLook): THREE.BufferGeometry {
  const { skin, cloth } = look;
  const parts: Box[] = [
    { p: [0, 3.9, 0], s: [2.1, 0.9, 1.4], c: shade(cloth, 0.6) },
    { p: [0, 5.6, 0], s: [2.6, 2.9, 1.7], c: cloth },
    // Ribcage showing through a torn shirt.
    { p: [0, 5.4, 0.85], s: [1.5, 1.7, 0.3], c: skin },
    { p: [0, 5.95, 0.95], s: [1.3, 0.18, 0.2], c: shade(skin, 0.72) },
    { p: [0, 5.45, 0.95], s: [1.3, 0.18, 0.2], c: shade(skin, 0.72) },
    { p: [0, 4.95, 0.95], s: [1.1, 0.18, 0.2], c: shade(skin, 0.72) },
    { p: [-1.35, 5.8, -0.2], s: [0.5, 2.7, 1.5], c: shade(cloth, 1.25) },
    { p: [1.35, 5.8, -0.2], s: [0.5, 2.7, 1.5], c: shade(cloth, 0.7) },
    { p: [-1.5, 7.0, -0.1], s: [1.0, 0.95, 1.5], c: shade(cloth, 1.1) },
    { p: [1.5, 7.0, -0.1], s: [1.0, 0.95, 1.5], c: shade(cloth, 1.1) },
    // Arms reaching forward.
    { p: [-1.65, 6.3, 0.9], s: [0.85, 0.85, 2.2], c: cloth },
    { p: [1.65, 6.4, 0.9], s: [0.85, 0.85, 2.2], c: cloth },
    { p: [-1.65, 5.9, 2.2], s: [0.8, 0.8, 1.9], c: skin, r: [0.25, 0, 0] },
    { p: [1.65, 6.05, 2.2], s: [0.8, 0.8, 1.9], c: skin, r: [0.18, 0, 0] },
    { p: [-1.65, 5.5, 3.2], s: [0.9, 0.65, 0.8], c: shade(skin, 0.85) },
    { p: [1.65, 5.7, 3.2], s: [0.9, 0.65, 0.8], c: shade(skin, 0.85) },
    { p: [0, 7.4, 0], s: [0.9, 0.8, 0.9], c: shade(skin, 0.8) },
    ...zombieHead(8.35, skin, 0x241f1a),
  ];
  if (look.armored) {
    parts.push(
      { p: [0, 5.9, 0.5], s: [3.0, 1.2, 1.9], c: 0x8e9aa6 },
      { p: [0, 5.95, 0.55], s: [3.1, 0.22, 1.95], c: 0xc7d2dd },
      { p: [0, 4.5, 0.5], s: [2.8, 1.1, 1.85], c: 0x7c8794 },
      { p: [0, 9.9, 0], s: [2.3, 0.8, 2.3], c: 0x6a7480 },
      { p: [0, 9.2, 0.9], s: [2.0, 0.7, 0.5], c: 0x2b323a },
    );
  }
  if (look.band) parts.push({ p: [0, 6.6, 0.9], s: [2.7, 0.45, 0.3], c: 0xc4564a });
  return mergeBoxes(parts);
}

export function zombieLeg(look: ZombieLook): THREE.BufferGeometry {
  return mergeBoxes([
    { p: [0, -1.6, 0], s: [1.0, 3.4, 1.0], c: shade(look.cloth, 0.5) },
    { p: [0, -3.6, 0.1], s: [1.05, 0.75, 1.5], c: 0x2c2620 },
  ]);
}

/* ----------------------------------------------------------------- brutes */

export const BRUTE_HIP_Y = 5.0;
export const BRUTE_LEG_X = 1.3;
export const BRUTE_HEIGHT = 17.5;

export interface BruteLook {
  skin: number;
  apron: number;
}

export function bruteBody(look: BruteLook): THREE.BufferGeometry {
  const { skin, apron } = look;
  return mergeBoxes([
    { p: [0, 4.6, 0], s: [4.2, 1.2, 2.6], c: shade(skin, 0.85) },
    { p: [0, 7.0, 0], s: [5.4, 4.2, 3.2], c: skin },
    { p: [0, 6.9, 1.5], s: [4.2, 4.6, 0.7], c: apron },
    { p: [0, 8.9, 1.3], s: [1.2, 1.2, 0.5], c: shade(apron, 0.7) },
    { p: [0, 5.0, 1.55], s: [4.4, 1.0, 0.6], c: shade(apron, 0.65) },
    { p: [-3.1, 7.2, 0.4], s: [1.7, 4.4, 1.7], c: skin, r: [0.2, 0, 0] },
    { p: [3.1, 7.2, 0.4], s: [1.7, 4.4, 1.7], c: skin, r: [0.2, 0, 0] },
    { p: [-3.3, 4.9, 1.9], s: [1.9, 1.4, 1.9], c: shade(skin, 0.82) },
    { p: [3.3, 4.9, 1.9], s: [1.9, 1.4, 1.9], c: shade(skin, 0.82) },
    { p: [0, 9.5, 0], s: [1.6, 0.9, 1.6], c: shade(skin, 0.8) },
    ...zombieHead(10.6, skin, 0x2b1a16).map((b) => ({
      ...b,
      p: [b.p[0] * 1.5, b.p[1] + 0.4, b.p[2] * 1.5] as [number, number, number],
      s: [b.s[0] * 1.5, b.s[1] * 1.4, b.s[2] * 1.5] as [number, number, number],
    })),
  ]);
}

export function bruteLeg(look: BruteLook): THREE.BufferGeometry {
  return mergeBoxes([
    { p: [0, -1.8, 0], s: [1.7, 4.2, 1.7], c: shade(look.apron, 0.55) },
    { p: [0, -4.2, 0.3], s: [1.8, 1.1, 2.3], c: 0x2a2119 },
  ]);
}
