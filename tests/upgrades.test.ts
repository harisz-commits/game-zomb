import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config/BalanceConfig';
import { UPGRADE_DEFINITIONS, UPGRADES_BY_ID } from '../src/data/upgradeDefinitions';
import { UpgradeSystem } from '../src/systems/UpgradeSystem';
import type { Rarity } from '../src/types/game';
import { SeededRandom } from '../src/utils/SeededRandom';

const RANK: Record<Rarity, number> = { COMMON: 0, RARE: 1, EPIC: 2, LEGENDARY: 3 };

function system(seed = 1234): UpgradeSystem {
  return new UpgradeSystem(new SeededRandom(seed));
}

describe('upgrade definitions', () => {
  it('has unique ids', () => {
    const ids = new Set(UPGRADE_DEFINITIONS.map((u) => u.id));
    expect(ids.size).toBe(UPGRADE_DEFINITIONS.length);
  });

  it('references only existing prerequisites and exclusions', () => {
    for (const def of UPGRADE_DEFINITIONS) {
      for (const id of def.prerequisites ?? []) expect(UPGRADES_BY_ID.has(id)).toBe(true);
      for (const id of def.prerequisitesAny ?? []) expect(UPGRADES_BY_ID.has(id)).toBe(true);
      for (const id of def.incompatibleWith ?? []) expect(UPGRADES_BY_ID.has(id)).toBe(true);
    }
  });

  it('covers every rarity and every family', () => {
    const rarities = new Set(UPGRADE_DEFINITIONS.map((u) => u.rarity));
    const families = new Set(UPGRADE_DEFINITIONS.map((u) => u.family));
    expect(rarities.size).toBe(4);
    expect(families.size).toBe(6);
  });
});

describe('generateChoices', () => {
  it('never offers duplicates inside one draft', () => {
    for (let seed = 0; seed < 60; seed++) {
      const upgrades = system(seed);
      const { choices } = upgrades.generateChoices(1);
      const ids = new Set(choices.map((c) => c.id));
      expect(ids.size).toBe(choices.length);
      expect(choices.length).toBe(BALANCE.UPGRADE_CHOICES);
    }
  });

  it('stops offering a card once it hits max level', () => {
    const upgrades = system(7);
    const target = UPGRADES_BY_ID.get('bullet_storm')!; // maxLevel 1
    upgrades.apply(target);

    expect(upgrades.getLevel('bullet_storm')).toBe(1);
    expect(upgrades.isAvailable(target)).toBe(false);
    for (let i = 1; i <= 40; i++) {
      const { choices } = upgrades.generateChoices(i);
      expect(choices.some((c) => c.id === 'bullet_storm')).toBe(false);
    }
  });

  it('hides cards whose prerequisites are missing', () => {
    const upgrades = system(11);
    const rapid2 = UPGRADES_BY_ID.get('rapid_fire_2')!;
    expect(upgrades.isAvailable(rapid2)).toBe(false);

    upgrades.apply(UPGRADES_BY_ID.get('rapid_fire_1')!);
    expect(upgrades.isAvailable(rapid2)).toBe(true);
  });

  it('supports "any of" prerequisites', () => {
    const upgrades = system(12);
    const frag = UPGRADES_BY_ID.get('frag_ammo')!;
    expect(upgrades.isAvailable(frag)).toBe(false);

    upgrades.apply(UPGRADES_BY_ID.get('pocket_charges')!);
    expect(upgrades.isAvailable(frag)).toBe(true);
  });

  it('locks out incompatible cards in both directions', () => {
    const a = system(13);
    a.apply(UPGRADES_BY_ID.get('heavy_caliber')!);
    expect(a.isAvailable(UPGRADES_BY_ID.get('featherweight')!)).toBe(false);

    const b = system(13);
    b.apply(UPGRADES_BY_ID.get('featherweight')!);
    expect(b.isAvailable(UPGRADES_BY_ID.get('heavy_caliber')!)).toBe(false);
  });

  it('uses the configured rarity weights per promotion band', () => {
    const upgrades = system(99);
    expect(upgrades.getRarityWeights(1).COMMON).toBe(55);
    expect(upgrades.getRarityWeights(3).RARE).toBe(40);
    expect(upgrades.getRarityWeights(9).LEGENDARY).toBe(10);
  });
});

describe('pity system', () => {
  it('guarantees an epic or better on every 5th promotion', () => {
    for (let seed = 0; seed < 40; seed++) {
      const upgrades = system(seed);
      const { choices, pityApplied } = upgrades.generateChoices(BALANCE.PITY_EPIC_EVERY);
      expect(pityApplied).toBe(true);
      expect(choices.some((c) => RANK[c.rarity] >= RANK.EPIC)).toBe(true);
    }
  });

  it('guarantees a legendary on every 10th promotion', () => {
    for (let seed = 0; seed < 40; seed++) {
      const upgrades = system(seed);
      const { choices } = upgrades.generateChoices(BALANCE.PITY_LEGENDARY_EVERY);
      expect(choices.some((c) => c.rarity === 'LEGENDARY')).toBe(true);
    }
  });

  it('does not force a rarity on ordinary promotions', () => {
    const upgrades = system(3);
    expect(upgrades.generateChoices(3).pityApplied).toBe(false);
  });
});

describe('modifier aggregation', () => {
  it('multiplies multiplicative effects and sums additive ones', () => {
    const upgrades = system(5);
    upgrades.apply(UPGRADES_BY_ID.get('heavy_caliber')!); // x1.15 dmg, x0.95 rate
    upgrades.apply(UPGRADES_BY_ID.get('marksman_training')!); // +8% crit
    upgrades.apply(UPGRADES_BY_ID.get('piercing_ammo')!); // +1 pierce

    const mods = upgrades.modifiers;
    expect(mods.damageMultiplier).toBeCloseTo(1.15, 5);
    expect(mods.fireRateMultiplier).toBeCloseTo(0.95, 5);
    expect(mods.critChance).toBeCloseTo(BALANCE.BASE_CRIT_CHANCE + 0.08, 5);
    expect(mods.pierce).toBe(1);
  });

  it('stacks a repeated card by its level', () => {
    const upgrades = system(6);
    const steady = UPGRADES_BY_ID.get('steady_aim')!;
    upgrades.apply(steady);
    upgrades.apply(steady);
    expect(upgrades.getLevel('steady_aim')).toBe(2);
    expect(upgrades.modifiers.damageMultiplier).toBeCloseTo(1.08 * 1.08, 5);
  });

  it('collects special handlers into the modifier state', () => {
    const upgrades = system(8);
    upgrades.apply(UPGRADES_BY_ID.get('napalm')!);
    expect(upgrades.modifiers.specials.has('NAPALM')).toBe(true);
  });
});

describe('doctrines', () => {
  it('unlocks at three cards of a family and upgrades at six', () => {
    const upgrades = system(21);
    const firepower = UPGRADE_DEFINITIONS.filter((u) => u.family === 'FIREPOWER');

    let unlocks = 0;
    let applied = 0;
    for (const def of firepower) {
      for (let level = 0; level < def.maxLevel && applied < 6; level++) {
        if (!upgrades.isAvailable(def)) break;
        const unlock = upgrades.apply(def);
        applied++;
        if (unlock) {
          unlocks++;
          expect(unlock.definition.family).toBe('FIREPOWER');
          expect(unlock.level).toBe(unlocks);
        }
      }
    }

    expect(applied).toBe(6);
    expect(unlocks).toBe(2);
    expect(upgrades.modifiers.doctrineLevels.FIREPOWER).toBe(2);
  });

  it('feeds doctrine effects into the aggregated modifiers', () => {
    const upgrades = system(22);
    upgrades.apply(UPGRADES_BY_ID.get('piercing_ammo')!);
    upgrades.apply(UPGRADES_BY_ID.get('armor_breaker')!);
    const before = upgrades.modifiers.pierce;
    upgrades.apply(UPGRADES_BY_ID.get('hardened_tips')!); // 3rd BALLISTICS card

    expect(upgrades.modifiers.doctrineLevels.BALLISTICS).toBe(1);
    // Penetration doctrine grants +1 pierce on top of the cards.
    expect(upgrades.modifiers.pierce).toBe(before + 1);
  });
});
