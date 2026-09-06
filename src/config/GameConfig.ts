/**
 * Technical / presentation configuration.
 *
 * Gameplay numbers live in BalanceConfig.ts - keep the split intact so that
 * balancing never requires touching engine wiring.
 */

/** Working title. Change here, it is used by every screen and the document title. */
export const GAME_TITLE = 'LAST LINE';
export const GAME_SUBTITLE = 'HOLD THE LINE. GROW THE ARMY.';

/**
 * The virtual play field. All gameplay math happens in these units, which are
 * mapped onto the real canvas by a camera zoom (see `Viewport`).
 * Primary design target is 9:16 portrait.
 */
export const FIELD_W = 720;
export const FIELD_H = 1280;

/** Horizontal bounds the formation centre may reach. */
export const FIELD_PADDING_X = 46;

/**
 * The bridge is split into two lanes by a central divider.
 *
 *   LEFT  (supply lane)  - frozen supply blocks descend here. Shoot them open
 *                          to collect what is inside.
 *   RIGHT (combat lane)  - the horde advances here, plus penalty barriers.
 *
 * Soldiers fire straight ahead, so where the formation stands decides what it
 * shoots. That trade-off - break the supply block, or hold the horde - is the
 * core decision of the game.
 */
export const SUPPLY_LANE_RATIO = 0.4;

/**
 * How far off its own column a soldier may still engage a target.
 *
 * Generous on purpose: the decision this game is built on is *which lane* the
 * formation points at, not pixel-perfect alignment inside a lane. A tight cone
 * made a 10-soldier starting squad unable to kill anything at all.
 */
export const FIRING_COLUMN_HALF_WIDTH = 58;

/** World units the bridge scrolls past the army per second. */
export const WORLD_SCROLL_SPEED = 110;

/**
 * Y of the front (top-most) formation row when the army is at rest.
 *
 * Set from the reference footage: the firing line sits at 73% of the screen
 * height, leaving the bottom quarter as empty road behind the formation.
 */
export const ARMY_BASE_Y = 825;

/**
 * Share of the visible width the bridge takes up at the firing line.
 *
 * The reference bridge does not run edge to edge - there is sky and city down
 * both sides for the whole height of the screen, and that is a big part of why
 * it reads as an elevated span rather than a corridor.
 */
export const FIELD_WIDTH_RATIO = 0.875;

/* ------------------------------------------------------------ perspective --
 * The battlefield is drawn as a receding plane.
 *
 * The projection is a pure horizontal shear: world y is left untouched (so no
 * speed, range or timing value in the game has to change) while world x is
 * pulled toward a vanishing point that sits far above the field. Straight
 * lines stay straight, so the lanes, railings and divider all converge, and
 * sprites shrink with distance.
 *
 * Because both a soldier and its target are projected the same way, a soldier
 * firing "straight ahead" traces a converging line - which is exactly what a
 * line running away from the camera looks like in perspective.
 */

/**
 * World y of the vanishing point.
 *
 * Taken from the reference, not invented: its two road edges intersect 2248 px
 * above a 1918 px frame whose firing line sits at 0.73 of the height. Carried
 * into these units that puts the vanishing point at -2380, which reproduces
 * the reference taper exactly - 0.616 of the firing-line width at the top of
 * the screen, 1.142 at the bottom.
 */
export const HORIZON_Y = -2380;

/** The row that renders at scale 1 - the army's front line. */
export const DEPTH_ANCHOR_Y = ARMY_BASE_Y;

/** Floor on the depth scale so distant enemies stay readable on small phones. */
export const MIN_DEPTH_SCALE = 0.45;

/** Distance above the army where the haze starts eating contrast. */
export const FOG_START_Y = 340;
/** Strongest haze alpha, reached at the top of the field. */
export const FOG_MAX = 0.6;

export const ENTITY_LIMITS = {
  maxVisibleSoldiers: 140,
  maxActiveZombies: 180,
  maxVisualProjectiles: 80,
  maxDamageNumbers: 25,
  maxParticles: 150,
  maxExplosions: 24,
  maxSpits: 30,
} as const;

export type QualityLevel = 'HIGH' | 'MEDIUM' | 'LOW';

export interface QualitySettings {
  /** Fraction of internal shots that are drawn as a tracer. */
  tracerFraction: number;
  particleScale: number;
  shakeScale: number;
  damageNumbers: boolean;
  /** Ground shadow + muzzle light under the formation. */
  groundLight: boolean;
  /** Secondary zombie animation (bobbing) on/off. */
  enemyBob: boolean;
}

export const QUALITY_PRESETS: Record<QualityLevel, QualitySettings> = {
  HIGH: {
    tracerFraction: 0.3,
    particleScale: 1,
    shakeScale: 1,
    damageNumbers: true,
    groundLight: true,
    enemyBob: true,
  },
  MEDIUM: {
    tracerFraction: 0.18,
    particleScale: 0.6,
    shakeScale: 0.75,
    damageNumbers: true,
    groundLight: true,
    enemyBob: true,
  },
  LOW: {
    tracerFraction: 0.09,
    particleScale: 0.3,
    shakeScale: 0.5,
    damageNumbers: false,
    groundLight: false,
    enemyBob: false,
  },
};

export const QUALITY_CONFIG = {
  /** Seconds of sustained low FPS before dropping a level. */
  degradeAfterSeconds: 2.5,
  /** Seconds of sustained good FPS before recovering a level. */
  recoverAfterSeconds: 12,
  degradeBelowFps: 44,
  recoverAboveFps: 57,
} as const;

/**
 * Colour palette.
 *
 * The battlefield is a *daylight* scene: bright hazy sky, pale concrete deck,
 * dark steel. Units are drawn as saturated shapes against that light ground,
 * which is what keeps a 150-strong horde readable without any outline pass.
 * The HUD stays on dark panels so it never competes with the bridge.
 */
export const COLORS = {
  /** Sky, top of the screen to the horizon haze. */
  skyTop: 0x2f78b4,
  skyHorizon: 0xbcd6e8,
  /** Bridge deck, near the camera and far up-field. */
  deckNear: 0xb6bbbe,
  deckFar: 0x8fa2b4,
  /** Steel of the railings and the central divider. */
  steel: 0x555f6b,
  steelLit: 0x9aa6b4,
  steelDark: 0x333b45,
  /** Distant city. */
  city: 0x4d6b8c,
  /** What far-away things fade into. */
  haze: 0xb4cee0,
  bgTop: 0x2b6ea6,
  bgBottom: 0x8fb4d0,
  ground: 0x9a9992,
  groundLine: 0x7d8894,
  danger: 0xff5a5a,
  soldierBlue: 0x5ea9ff,
  accentGreen: 0x7fd4a2,
  accentAmber: 0xffc65c,
  textPrimary: 0xf2f6ff,
  textDim: 0x8a99b3,
  panel: 0x0e141d,
  panelBorder: 0x27334a,
} as const;

export const RARITY_COLORS: Record<string, number> = {
  COMMON: 0x9fb0c8,
  RARE: 0x4fa3ff,
  EPIC: 0xb56cff,
  LEGENDARY: 0xffb648,
};

export const FAMILY_COLORS: Record<string, number> = {
  FIREPOWER: 0xff8a4c,
  BALLISTICS: 0x6fd6ff,
  PRECISION: 0xffe066,
  EXPLOSIVES: 0xff6b6b,
  COMMAND: 0x7fd4a2,
  DEFENSE: 0x9aa7ff,
};

export const FAMILY_ICONS: Record<string, string> = {
  FIREPOWER: '▲',
  BALLISTICS: '✦',
  PRECISION: '⌖',
  EXPLOSIVES: '✹',
  COMMAND: '⚑',
  DEFENSE: '◆',
};

export const FONT_FAMILY =
  'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

export const STORAGE_KEY = 'lastline.save.v1';

/** Debug mode is opt-in via `?debug=true` and compiled out of production. */
export function isDebugEnabled(): boolean {
  if (!import.meta.env.DEV && !ALLOW_DEBUG_IN_PROD) return false;
  if (typeof window === 'undefined') return false;
  try {
    return new URLSearchParams(window.location.search).get('debug') === 'true';
  } catch {
    return false;
  }
}

/** Flip to true only for internal QA builds. */
export const ALLOW_DEBUG_IN_PROD = false;

/** Optional deterministic run seed via `?seed=12345`. */
export function getSeedFromUrl(): number | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = new URLSearchParams(window.location.search).get('seed');
    if (!raw) return null;
    const value = Number.parseInt(raw, 10);
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}
