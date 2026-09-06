/**
 * Weapon tiers.
 *
 * The whole point of these is that an upgrade is *visible*: every tier has its
 * own silhouette in the soldiers' hands and its own neon glyph on the crate
 * that grants it, so "I got a better gun" is something you see on the
 * battlefield rather than something you read in a stat line.
 *
 * Power lives here too - a weapon tier multiplies damage and rate of fire on
 * top of the soldier tier, so the two ladders (more soldiers, better guns) are
 * independent and both matter.
 */
export interface WeaponTier {
  id: string;
  name: string;
  damageMultiplier: number;
  fireRateMultiplier: number;
  /** Tracer / muzzle colour, so heavier weapons also *sound* bigger visually. */
  tracerColor: number;
  tracerWidth: number;
}

export const WEAPON_TIERS: WeaponTier[] = [
  {
    id: 'RIFLE',
    name: 'RIFLE',
    damageMultiplier: 1,
    fireRateMultiplier: 1,
    tracerColor: 0xffd98a,
    tracerWidth: 1,
  },
  {
    id: 'CARBINE',
    name: 'CARBINE',
    damageMultiplier: 1.35,
    fireRateMultiplier: 1.08,
    tracerColor: 0xffc45c,
    tracerWidth: 1.15,
  },
  {
    id: 'ASSAULT',
    name: 'ASSAULT RIFLE',
    damageMultiplier: 1.8,
    fireRateMultiplier: 1.16,
    tracerColor: 0xffa93c,
    tracerWidth: 1.35,
  },
  {
    id: 'HEAVY',
    name: 'HEAVY RIFLE',
    damageMultiplier: 2.4,
    fireRateMultiplier: 1.24,
    tracerColor: 0xff8a2c,
    tracerWidth: 1.6,
  },
  {
    id: 'LMG',
    name: 'MACHINE GUN',
    damageMultiplier: 3.2,
    fireRateMultiplier: 1.34,
    tracerColor: 0xff6a2a,
    tracerWidth: 1.9,
  },
  {
    id: 'MINIGUN',
    name: 'MINIGUN',
    damageMultiplier: 4.2,
    fireRateMultiplier: 1.5,
    tracerColor: 0xff4d2a,
    tracerWidth: 2.3,
  },
];

export const MAX_WEAPON_LEVEL = WEAPON_TIERS.length - 1;

export function getWeaponTier(level: number): WeaponTier {
  const index = level < 0 ? 0 : level > MAX_WEAPON_LEVEL ? MAX_WEAPON_LEVEL : level;
  return WEAPON_TIERS[index];
}
