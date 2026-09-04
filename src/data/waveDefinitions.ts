import type { EndlessModifier, EndlessModifierState, WavePhase } from '../types/game';

/**
 * Campaign timeline.
 *
 * These are *phases*, not fixed waves: the EnemyDirector still decides how many
 * enemies to spawn based on elapsed time and army power. A phase only shapes
 * the composition, the intensity multiplier and one-off scripted events.
 */
export const CAMPAIGN_PHASES: WavePhase[] = [
  {
    at: 0,
    label: 'CONTACT',
    intensity: 0.75,
    weights: { WALKER: 10 },
    eliteChance: 0,
  },
  {
    at: 30,
    label: 'RUNNERS',
    intensity: 0.95,
    weights: { WALKER: 10, RUNNER: 6, SWARMER: 3 },
    eliteChance: 0.01,
  },
  {
    at: 60,
    label: 'THE HORDE',
    intensity: 1.1,
    weights: { WALKER: 10, RUNNER: 7, SWARMER: 7, BRUTE: 2 },
    eliteChance: 0.02,
  },
  {
    at: 90,
    label: 'ELITE CONTACT',
    intensity: 1.15,
    weights: { WALKER: 9, RUNNER: 7, SWARMER: 6, BRUTE: 3, ARMORED: 3, SPITTER: 2 },
    eliteChance: 0.05,
    event: 'ELITE_ENCOUNTER',
  },
  {
    at: 120,
    label: 'PRESSURE',
    intensity: 1.25,
    weights: { WALKER: 8, RUNNER: 8, SWARMER: 7, BRUTE: 4, ARMORED: 4, SPITTER: 3 },
    eliteChance: 0.06,
  },
  {
    at: 150,
    label: 'MINI BOSS',
    intensity: 0.85,
    weights: { WALKER: 7, RUNNER: 6, SWARMER: 8, BRUTE: 3, ARMORED: 3, SPITTER: 2 },
    eliteChance: 0.05,
    event: 'MINI_BOSS',
  },
  {
    at: 180,
    label: 'OVERRUN',
    intensity: 1.35,
    weights: { WALKER: 7, RUNNER: 9, SWARMER: 9, BRUTE: 5, ARMORED: 5, SPITTER: 3 },
    eliteChance: 0.08,
  },
  {
    at: 240,
    label: 'FINAL ASSAULT',
    intensity: 1.5,
    weights: { WALKER: 6, RUNNER: 10, SWARMER: 10, BRUTE: 6, ARMORED: 6, SPITTER: 4 },
    eliteChance: 0.11,
  },
  {
    at: 295,
    label: 'BOSS',
    intensity: 0.6,
    weights: { WALKER: 5, SWARMER: 6, RUNNER: 5 },
    eliteChance: 0.04,
    event: 'FINAL_BOSS',
  },
];

/**
 * Endless composition once the campaign timeline is exhausted. The director
 * keeps scaling difficulty on top of this.
 */
export const ENDLESS_BASE_PHASE: WavePhase = {
  at: 0,
  label: 'ENDLESS',
  intensity: 1.4,
  weights: { WALKER: 7, RUNNER: 9, SWARMER: 9, BRUTE: 5, ARMORED: 6, SPITTER: 4 },
  eliteChance: 0.1,
};

/** Endless modifiers, rolled every 30-60s and stacking for the rest of the run. */
export const ENDLESS_MODIFIERS: EndlessModifier[] = [
  {
    id: 'HP',
    label: '+15% ZOMBIE HP',
    apply: (s: EndlessModifierState) => {
      s.hpMultiplier *= 1.15;
    },
  },
  {
    id: 'SPEED',
    label: '+10% ZOMBIE SPEED',
    apply: (s: EndlessModifierState) => {
      s.speedMultiplier *= 1.1;
    },
  },
  {
    id: 'SPAWN',
    label: '+20% SPAWN RATE',
    apply: (s: EndlessModifierState) => {
      s.spawnRateMultiplier *= 1.2;
    },
  },
  {
    id: 'ELITE',
    label: 'MORE ELITES',
    apply: (s: EndlessModifierState) => {
      s.eliteChanceAdd += 0.05;
    },
  },
  {
    id: 'ARMORED',
    label: 'MORE ARMORED',
    apply: (s: EndlessModifierState) => {
      s.armoredWeightMultiplier *= 1.6;
    },
  },
  {
    id: 'RUNNERS',
    label: 'MORE RUNNERS',
    apply: (s: EndlessModifierState) => {
      s.runnerWeightMultiplier *= 1.6;
    },
  },
];

export function createEndlessModifierState(): EndlessModifierState {
  return {
    hpMultiplier: 1,
    speedMultiplier: 1,
    spawnRateMultiplier: 1,
    eliteChanceAdd: 0,
    armoredWeightMultiplier: 1,
    runnerWeightMultiplier: 1,
  };
}

/** Returns the active campaign phase for an elapsed time. */
export function getPhaseAt(elapsed: number): WavePhase {
  let current = CAMPAIGN_PHASES[0];
  for (const phase of CAMPAIGN_PHASES) {
    if (elapsed >= phase.at) current = phase;
    else break;
  }
  return current;
}
