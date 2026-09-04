import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/BalanceConfig';
import { CAMPAIGN_PHASES, getPhaseAt } from '../src/data/waveDefinitions';
import { EnemyDirector, type DirectorSnapshot } from '../src/systems/EnemyDirector';
import { SeededRandom } from '../src/utils/SeededRandom';

function snapshot(overrides: Partial<DirectorSnapshot> = {}): DirectorSnapshot {
  return {
    elapsed: 0,
    armyPower: BALANCE.STARTING_SOLDIERS,
    promotionCount: 0,
    kills: 0,
    armySize: BALANCE.STARTING_SOLDIERS,
    activeZombies: 0,
    ...overrides,
  };
}

describe('campaign phases', () => {
  it('are ordered and start at zero', () => {
    expect(CAMPAIGN_PHASES[0].at).toBe(0);
    for (let i = 1; i < CAMPAIGN_PHASES.length; i++) {
      expect(CAMPAIGN_PHASES[i].at).toBeGreaterThan(CAMPAIGN_PHASES[i - 1].at);
    }
  });

  it('resolves the right phase for a timestamp', () => {
    expect(getPhaseAt(0).label).toBe('CONTACT');
    expect(getPhaseAt(45).label).toBe('RUNNERS');
    expect(getPhaseAt(9999).label).toBe(CAMPAIGN_PHASES[CAMPAIGN_PHASES.length - 1].label);
  });

  it('schedules the scripted encounters of a standard run', () => {
    const events = CAMPAIGN_PHASES.filter((p) => p.event).map((p) => [p.event, p.at]);
    expect(events).toEqual([
      ['ELITE_ENCOUNTER', 90],
      ['MINI_BOSS', 150],
      ['FINAL_BOSS', 295],
    ]);
  });
});

describe('EnemyDirector', () => {
  it('increases spawn pressure over time', () => {
    const director = new EnemyDirector(new SeededRandom(1));
    director.start('CAMPAIGN');

    const early = director.spawnRate(snapshot({ elapsed: 10 }));
    const late = director.spawnRate(snapshot({ elapsed: 200 }));
    expect(late).toBeGreaterThan(early);
  });

  it('caps the spawn rate', () => {
    const director = new EnemyDirector(new SeededRandom(1));
    director.start('ENDLESS');
    const extreme = director.spawnRate(snapshot({ elapsed: 100000, armyPower: 1e9 }));
    expect(extreme).toBeLessThanOrEqual(BALANCE.SPAWN_RATE_CAP);
  });

  it('scales with army power only gently, and within the cap', () => {
    const director = new EnemyDirector(new SeededRandom(1));
    director.start('CAMPAIGN');

    const weak = director.spawnRate(snapshot({ elapsed: 60, armyPower: 10 }));
    const strong = director.spawnRate(snapshot({ elapsed: 60, armyPower: 10 * 1024 }));

    expect(strong).toBeGreaterThan(weak);
    // A 1000x stronger army must never make the game more than the configured
    // cap harder - a great build has to feel overpowered.
    expect(strong / weak).toBeLessThanOrEqual(1 + BALANCE.POWER_SCALING_CAP + 1e-9);
  });

  it('never lets a paused frame bank up a spawn burst', () => {
    const director = new EnemyDirector(new SeededRandom(1));
    director.start('CAMPAIGN');
    const budget = director.update(30, snapshot({ elapsed: 120 }));
    expect(budget).toBeLessThanOrEqual(BALANCE.SPAWN_BURST_CAP);
  });

  it('raises enemy HP over time', () => {
    const director = new EnemyDirector(new SeededRandom(1));
    director.start('CAMPAIGN');
    expect(director.getHpMultiplier(0)).toBeCloseTo(1, 5);
    expect(director.getHpMultiplier(120)).toBeGreaterThan(director.getHpMultiplier(30));
  });

  it('caps enemy speed scaling', () => {
    const director = new EnemyDirector(new SeededRandom(1));
    director.start('CAMPAIGN');
    expect(director.getSpeedMultiplier(100000)).toBeLessThanOrEqual(
      1 + BALANCE.ZOMBIE_SPEED_SCALING_CAP + 1e-9,
    );
  });

  it('applies stacking modifiers in endless mode only', () => {
    const campaign = new EnemyDirector(new SeededRandom(3));
    campaign.start('CAMPAIGN');
    campaign.update(1, snapshot({ elapsed: 600 }));
    expect(campaign.endlessModifiers.length).toBe(0);

    const endless = new EnemyDirector(new SeededRandom(3));
    endless.start('ENDLESS');
    for (let t = 0; t < 400; t += 1) endless.update(1, snapshot({ elapsed: t }));
    expect(endless.endlessModifiers.length).toBeGreaterThan(3);

    const state = endless.modifierState;
    expect(
      state.hpMultiplier *
        state.speedMultiplier *
        state.spawnRateMultiplier *
        (1 + state.eliteChanceAdd),
    ).toBeGreaterThan(1);
  });

  it('keeps the elite chance bounded', () => {
    const endless = new EnemyDirector(new SeededRandom(4));
    endless.start('ENDLESS');
    for (let t = 0; t < 5000; t += 1) endless.update(1, snapshot({ elapsed: t }));
    expect(endless.getEliteChance()).toBeLessThanOrEqual(0.45);
  });
});

describe('planSpawns budget accounting', () => {
  const packSize = (kind: string) => (kind === 'SWARMER' ? 6 : 1);

  it('never spends more than the budget it was given', () => {
    for (let seed = 0; seed < 50; seed++) {
      const director = new EnemyDirector(new SeededRandom(seed));
      director.start('CAMPAIGN');
      // Advance into a phase whose composition includes swarmer packs.
      director.update(0.02, snapshot({ elapsed: 120 }));

      for (const budget of [0.2, 0.5, 1, 2.5, 5, 8]) {
        const orders = director.planSpawns(budget, 8, 150, packSize);
        const spent = orders.reduce((sum, o) => sum + o.cost, 0);
        expect(spent).toBeLessThanOrEqual(budget + 1e-9);
      }
    }
  });

  /**
   * Regression: pack spawns used to be priced *after* being committed, so a
   * pack of 6 swarmers cost the budget of one. Horde density ran ~4x over the
   * director's intent and difficulty scaling stopped meaning anything.
   */
  it('prices a pack by its full size, not per unit', () => {
    const director = new EnemyDirector(new SeededRandom(5));
    director.start('CAMPAIGN');
    director.update(0.02, snapshot({ elapsed: 120 }));

    const orders = director.planSpawns(8, 8, 150, packSize);
    for (const order of orders) {
      expect(order.cost).toBeCloseTo(director.costOf(order.kind) * order.count, 9);
    }
  });

  it('never plans more enemies than the remaining capacity', () => {
    for (let seed = 0; seed < 30; seed++) {
      const director = new EnemyDirector(new SeededRandom(seed));
      director.start('ENDLESS');
      director.update(0.02, snapshot({ elapsed: 200 }));

      for (const capacity of [1, 2, 5, 12]) {
        const orders = director.planSpawns(100, 8, capacity, packSize);
        const planned = orders.reduce((sum, o) => sum + o.count, 0);
        expect(planned).toBeLessThanOrEqual(capacity);
      }
    }
  });

  it('returns nothing for an exhausted budget or a full field', () => {
    const director = new EnemyDirector(new SeededRandom(1));
    director.start('CAMPAIGN');
    director.update(0.02, snapshot({ elapsed: 60 }));

    expect(director.planSpawns(0, 8, 150, packSize)).toEqual([]);
    expect(director.planSpawns(8, 8, 0, packSize)).toEqual([]);
    expect(director.planSpawns(8, 0, 150, packSize)).toEqual([]);
  });

  it('honours the per-tick order cap', () => {
    const director = new EnemyDirector(new SeededRandom(2));
    director.start('CAMPAIGN');
    director.update(0.02, snapshot({ elapsed: 60 }));
    expect(director.planSpawns(1000, 3, 150, () => 1).length).toBeLessThanOrEqual(3);
  });

  it('keeps the realised spawn rate close to the authorised cost rate', () => {
    // End-to-end replay of the spawn loop: enemies per second must track the
    // director's cost budget, not run away from it.
    const rng = new SeededRandom(777);
    const director = new EnemyDirector(rng);
    director.start('CAMPAIGN');

    const dt = 1 / 50;
    let elapsed = 0;
    let spawned = 0;
    let costRateSum = 0;
    let samples = 0;

    for (let frame = 0; frame < 50 * 120; frame++) {
      elapsed += dt;
      const snap = snapshot({ elapsed, armyPower: 10 + elapsed * 2, armySize: 10 + elapsed * 2 });
      const budget = director.update(dt, snap);

      const orders = director.planSpawns(budget, 8, 150, (k) =>
        k === 'SWARMER' ? rng.int(4, 7) : 1,
      );
      let spent = 0;
      for (const order of orders) {
        spawned += order.count;
        spent += order.cost;
      }
      if (spent > 0) director.consumeBudget(spent);

      costRateSum += director.spawnRate(snap);
      samples++;
    }

    const enemiesPerSecond = spawned / elapsed;
    const avgCostRate = costRateSum / samples;
    // Roughly one enemy per cost unit; the cheap swarmers pull it slightly up.
    expect(enemiesPerSecond).toBeGreaterThan(avgCostRate * 0.5);
    expect(enemiesPerSecond).toBeLessThan(avgCostRate * 1.6);
  });
});
