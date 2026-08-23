import { describe, expect, it } from 'vitest';
import { drawUpgradeCards } from '../src/run/UpgradeDraft';
import { RunModifiers } from '../src/run/RunModifiers';
import { Random } from '../src/util/Random';
import {
  DRAFT,
  MODIFIER_CAPS,
  UPGRADE_KINDS,
  rarityWeightsAt,
  type Rarity,
} from '../src/config/upgrades';
import { ArmyManager } from '../src/army/ArmyManager';
import { EventBus } from '../src/core/EventBus';
import { getTier } from '../src/config/unitTiers';

describe('upgrade draft', () => {
  it('always offers the configured number of cards', () => {
    for (let seed = 0; seed < 30; seed += 1) {
      expect(drawUpgradeCards(new Random(seed), 0)).toHaveLength(DRAFT.cardCount);
    }
  });

  /**
   * Dreimal dieselbe Wirkung in drei Stufen wäre keine Wahl, sondern eine
   * Preisliste. Die Arten müssen sich unterscheiden.
   */
  it('never offers the same kind twice in one draft', () => {
    for (let seed = 0; seed < 200; seed += 1) {
      const kinds = drawUpgradeCards(new Random(seed), seed % 10).map((c) => c.kind);
      expect(new Set(kinds).size).toBe(kinds.length);
    }
  });

  it('is reproducible from its seed', () => {
    const a = drawUpgradeCards(new Random(777), 3);
    const b = drawUpgradeCards(new Random(777), 3);
    expect(a).toEqual(b);
  });

  /** Die Beschreibung wird aus dem Wert erzeugt, nie danebengeschrieben. */
  it('describes exactly what it does', () => {
    for (let seed = 0; seed < 60; seed += 1) {
      for (const card of drawUpgradeCards(new Random(seed), 0)) {
        const spec = UPGRADE_KINDS.find((entry) => entry.kind === card.kind)!;
        expect(card.magnitude).toBe(spec.magnitude[card.rarity]);
        expect(card.description).toBe(spec.describe(card.magnitude));
      }
    }
  });

  /** Späte Karten sollen sich anders anfühlen als die ersten. */
  it('shifts towards better rarities over the run', () => {
    const early = rarityWeightsAt(0);
    const late = rarityWeightsAt(10);
    expect(late.common).toBeLessThan(early.common);
    expect(late.legendary).toBeGreaterThan(early.legendary);

    const share = (draftIndex: number): number => {
      const rng = new Random(4242);
      let good = 0;
      const rolls = 400;
      for (let i = 0; i < rolls; i += 1) {
        for (const card of drawUpgradeCards(rng, draftIndex)) {
          if (card.rarity === 'epic' || card.rarity === 'legendary') good += 1;
        }
      }
      return good / (rolls * DRAFT.cardCount);
    };
    expect(share(10)).toBeGreaterThan(share(0));
  });

  it('keeps rarity weights positive and sane', () => {
    for (const index of [0, 1, 5, 20, 100]) {
      const weights = rarityWeightsAt(index);
      for (const rarity of Object.keys(weights) as Rarity[]) {
        expect(weights[rarity]).toBeGreaterThan(0);
      }
    }
  });
});

describe('run modifiers', () => {
  it('starts neutral and returns to neutral on reset', () => {
    const mods = new RunModifiers();
    const neutral = { gateGain: 1, gateShield: 0, speed: 1, steering: 1, promotionDiscount: 0 };
    expect(mods).toMatchObject(neutral);
    mods.apply('gate-gain', 0.5);
    mods.apply('speed', 0.2);
    mods.reset();
    expect(mods).toMatchObject(neutral);
    expect(mods.taken).toHaveLength(0);
  });

  it('hands recruits back instead of storing them', () => {
    const mods = new RunModifiers();
    expect(mods.apply('recruit', 20)).toBe(20);
    expect(mods.apply('gate-gain', 0.25)).toBe(0);
    expect(mods.gateGain).toBeCloseTo(1.25);
  });

  /**
   * Ohne Obergrenzen stapeln sich vier legendäre Schilde zu völliger
   * Unverwundbarkeit — dann ist die Torwahl bedeutungslos.
   */
  it('caps stacking so gates never stop mattering', () => {
    const mods = new RunModifiers();
    for (let i = 0; i < 12; i += 1) {
      mods.apply('gate-shield', 0.9);
      mods.apply('promotion', 0.45);
      mods.apply('speed', 0.32);
      mods.apply('steering', 0.65);
    }
    expect(mods.gateShield).toBe(MODIFIER_CAPS.gateShield);
    expect(mods.promotionDiscount).toBe(MODIFIER_CAPS.promotionDiscount);
    expect(mods.speed).toBe(MODIFIER_CAPS.speed);
    expect(mods.steering).toBe(MODIFIER_CAPS.steering);
  });
});

describe('modifiers acting on the army', () => {
  it('increases what positive gates give', () => {
    const mods = new RunModifiers();
    mods.apply('gate-gain', 1);
    const plain = new ArmyManager(new EventBus(), 100);
    const boosted = new ArmyManager(new EventBus(), 100, mods);
    const plus20 = { kind: 'add' as const, value: 20, notation: 'flat' as const, weight: 1 };

    plain.applyGate(plus20);
    boosted.applyGate(plus20);
    expect(plain.combatPower).toBe(120);
    expect(boosted.combatPower).toBe(140);
  });

  /** Eine Wachstumskarte darf aus einer Strafe keine Verstärkung machen. */
  it('never turns a penalty into a bonus', () => {
    const mods = new RunModifiers();
    mods.apply('gate-gain', 1);
    const army = new ArmyManager(new EventBus(), 1000, mods);
    army.applyGate({ kind: 'multiply', value: 0.5, notation: 'factor', weight: 1 });
    expect(army.combatPower).toBeLessThan(1000);
  });

  it('softens penalties without erasing them', () => {
    const mods = new RunModifiers();
    mods.apply('gate-shield', 0.5);
    const army = new ArmyManager(new EventBus(), 1000, mods);
    // ×0.5 mit halbem Schild wird zu ×0.75.
    army.applyGate({ kind: 'multiply', value: 0.5, notation: 'factor', weight: 1 });
    expect(army.combatPower).toBe(750);
  });

  it('recruits in units of the current tier', () => {
    const army = new ArmyManager(new EventBus(), 500);
    army.tryPromote();
    const perUnit = getTier(army.current.tierIndex).powerPerUnit;
    const before = army.combatPower;
    army.recruit(20);
    expect(army.combatPower).toBe(before + 20 * perUnit);
  });

  it('lets a promotion card bring the next tier forward', () => {
    const mods = new RunModifiers();
    const army = new ArmyManager(new EventBus(), 100, mods);
    expect(army.promotionPending).toBe(false);
    mods.apply('promotion', 0.45);
    expect(army.promotionPending).toBe(true);
    expect(army.tryPromote()).toBeGreaterThan(0);
  });
});
