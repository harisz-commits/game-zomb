import { BALANCE } from '../config/BalanceConfig';
import type { DoctrineDefinition, UpgradeFamily } from '../types/game';

/**
 * Doctrines are the second meta layer inside a run: collect 3 cards of one
 * family and the doctrine unlocks automatically (no extra choice). 6 cards
 * upgrade it to level 2. Effects funnel through the same `UpgradeEffects`
 * aggregation as cards, so nothing special is needed downstream.
 */
export const DOCTRINE_DEFINITIONS: Record<UpgradeFamily, DoctrineDefinition> = {
  FIREPOWER: {
    id: 'GATLING_DOCTRINE',
    family: 'FIREPOWER',
    name: 'GATLING DOCTRINE',
    description: `Every ${BALANCE.GATLING_HITS_REQUIRED} hits the squad spins up to extreme fire rate.`,
    level1: { specials: ['BULLET_STORM'], fireRateMultiplier: 1.05 },
    level2: { fireRateMultiplier: 1.12 },
  },
  BALLISTICS: {
    id: 'PENETRATION_DOCTRINE',
    family: 'BALLISTICS',
    name: 'PENETRATION DOCTRINE',
    description: '+1 pierce and heavy armor penetration.',
    level1: { pierceAdd: 1, armoredDamageMultiplier: 1.25 },
    level2: { pierceAdd: 2, armoredDamageMultiplier: 1.35 },
  },
  PRECISION: {
    id: 'SNIPER_DOCTRINE',
    family: 'PRECISION',
    name: 'SNIPER DOCTRINE',
    description: `Every ${BALANCE.SNIPER_EVERY}th shot is a guaranteed heavy crit.`,
    level1: { critChanceAdd: 0.04 },
    level2: { critChanceAdd: 0.08, critMultiplierAdd: 0.5 },
  },
  EXPLOSIVES: {
    id: 'DEMOLITION_DOCTRINE',
    family: 'EXPLOSIVES',
    name: 'DEMOLITION DOCTRINE',
    description: 'Bigger, stronger explosions that can chain.',
    level1: {
      explosionRadiusMultiplier: 1.25,
      explosionDamageMultiplier: 1.3,
      specials: ['CHAIN_REACTION'],
    },
    level2: { explosionRadiusMultiplier: 1.35, explosionDamageMultiplier: 1.45 },
  },
  COMMAND: {
    id: 'MASS_MOBILIZATION',
    family: 'COMMAND',
    name: 'MASS MOBILIZATION',
    description: 'Strongly increased reinforcement gain.',
    level1: { reinforcementMultiplier: 1.35, supplyDropMultiplier: 1.25 },
    level2: { reinforcementMultiplier: 1.5, supplyDropMultiplier: 1.35 },
  },
  DEFENSE: {
    id: 'FORTRESS_DOCTRINE',
    family: 'DEFENSE',
    name: 'FORTRESS DOCTRINE',
    description: `A squad shield every ${BALANCE.FORTRESS_SHIELD_INTERVAL}s.`,
    level1: { hpMultiplier: 1.15, specials: ['EMERGENCY_SHIELD'] },
    level2: { hpMultiplier: 1.3, regenPerSecondAdd: 2 },
  },
};

/** Doctrine flavour colours reuse the family colours (see GameConfig). */
export function getDoctrine(family: UpgradeFamily): DoctrineDefinition {
  return DOCTRINE_DEFINITIONS[family];
}
