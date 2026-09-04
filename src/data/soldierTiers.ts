import type { SoldierTier } from '../types/game';

/**
 * Soldier tiers.
 *
 * `power` is the single source of truth for promotion math *and* per-soldier
 * stats: a soldier's damage and HP are the base value multiplied by the tier
 * power. That is what makes "one veteran ~= two rookies" literally true, so a
 * promotion never halves the army's actual combat strength.
 *
 * After BLACK OPS the ladder continues into prestige tiers (BLACK OPS *1,
 * *2, ...) with power doubling each time, so Endless mode has no hard ceiling.
 */
export const SOLDIER_TIERS: SoldierTier[] = [
  {
    id: 'SOLDIER',
    name: 'SOLDIERS',
    singular: 'SOLDIER',
    power: 1,
    prestige: 0,
    visual: 0,
    bodyColor: 0x4d7fb8,
    helmetColor: 0x8fc0f0,
    weaponColor: 0x2b3442,
    accentColor: 0x6ea8e8,
    muzzleColor: 0xffe9a8,
  },
  {
    id: 'VETERAN',
    name: 'VETERANS',
    singular: 'VETERAN',
    power: 2,
    prestige: 0,
    visual: 1,
    bodyColor: 0x3f7f63,
    helmetColor: 0x9adfb4,
    weaponColor: 0x232a34,
    accentColor: 0x7fd4a2,
    muzzleColor: 0xd6ffcf,
  },
  {
    id: 'ELITE',
    name: 'ELITE',
    singular: 'ELITE',
    power: 4,
    prestige: 0,
    visual: 2,
    bodyColor: 0x8a6a2f,
    helmetColor: 0xffd98a,
    weaponColor: 0x2a2318,
    accentColor: 0xffc65c,
    muzzleColor: 0xfff0c0,
  },
  {
    id: 'COMMANDO',
    name: 'COMMANDOS',
    singular: 'COMMANDO',
    power: 8,
    prestige: 0,
    visual: 3,
    bodyColor: 0x3c4250,
    helmetColor: 0x707d94,
    weaponColor: 0x171b22,
    accentColor: 0xff8a4c,
    muzzleColor: 0xffd0a0,
  },
  {
    id: 'SPECIAL_FORCES',
    name: 'SPECIAL FORCES',
    singular: 'SPECIAL FORCES',
    power: 16,
    prestige: 0,
    visual: 4,
    bodyColor: 0x2f4a63,
    helmetColor: 0x6fd6ff,
    weaponColor: 0x131820,
    accentColor: 0x6fd6ff,
    muzzleColor: 0xcdf3ff,
  },
  {
    id: 'BLACK_OPS',
    name: 'BLACK OPS',
    singular: 'BLACK OPS',
    power: 32,
    prestige: 0,
    visual: 5,
    bodyColor: 0x24262e,
    helmetColor: 0x4a4f5e,
    weaponColor: 0x0d0f14,
    accentColor: 0xb56cff,
    muzzleColor: 0xe6ccff,
  },
];

const BASE_TIER_COUNT = SOLDIER_TIERS.length;

/**
 * Returns the tier for an index, generating prestige tiers on demand.
 * Prestige tiers reuse the BLACK OPS silhouette with a star suffix and keep
 * doubling power, so Endless mode can promote forever.
 */
export function getSoldierTier(index: number): SoldierTier {
  if (index < BASE_TIER_COUNT) return SOLDIER_TIERS[Math.max(0, index)];

  const prestige = index - BASE_TIER_COUNT + 1;
  const last = SOLDIER_TIERS[BASE_TIER_COUNT - 1];
  const stars = '★'.repeat(Math.min(prestige, 3)) + (prestige > 3 ? String(prestige) : '');
  return {
    ...last,
    id: `BLACK_OPS_P${prestige}`,
    name: `BLACK OPS ${stars}`,
    singular: `BLACK OPS ${stars}`,
    power: last.power * Math.pow(2, prestige),
    prestige,
    accentColor: prestige % 2 === 0 ? 0xff6b6b : 0xb56cff,
  };
}

export function getTierCount(): number {
  return BASE_TIER_COUNT;
}
