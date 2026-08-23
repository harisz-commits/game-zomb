import { describe, expect, it, vi } from 'vitest';
import { canPromote, promote } from '../src/army/PromotionSystem';
import { createArmyState } from '../src/army/CombatPowerSystem';
import { ArmyManager } from '../src/army/ArmyManager';
import { EventBus } from '../src/core/EventBus';
import { UNIT_TIERS, MAX_TIER_INDEX, getTier } from '../src/config/unitTiers';
import { DISPLAY_CAPS } from '../src/config/gameBalance';

describe('promotion', () => {
  /**
   * Die wichtigste Eigenschaft des ganzen Systems: Beförderung tauscht
   * nichts ein. Ginge dabei Stärke verloren, wäre der Aufstieg eine Strafe.
   */
  it('never changes combat power', () => {
    for (const power of [1200, 5000, 237_000, 1e7, 4.2e9]) {
      const before = createArmyState(power, 0);
      const after = promote(before);
      expect(after.state.combatPower).toBe(before.combatPower);
    }
  });

  it('turns 100 militia into 1 rifleman', () => {
    const tier = getTier(1);
    expect(tier.powerPerUnit).toBe(100);
    // Genau die Rechnung aus der Spezifikation: 237 Militia → 2 Riflemen
    // plus 37 Punkte Restfortschritt.
    const promoted = createArmyState(237, 1);
    expect(promoted.displayCount).toBe(2);
    expect(promoted.overflowProgress).toBeCloseTo(0.37);
  });

  it('does not promote below the threshold', () => {
    const threshold = UNIT_TIERS[1]!.promotionThreshold;
    expect(canPromote(createArmyState(threshold - 1, 0))).toBe(false);
    expect(canPromote(createArmyState(threshold, 0))).toBe(true);
    expect(promote(createArmyState(threshold - 1, 0)).steps).toBe(0);
  });

  /**
   * Wer durch eine Kette von ×3-Toren zwei Schwellen überspringt, soll nicht
   * auf den übernächsten Kontrollpunkt warten müssen.
   */
  it('climbs several tiers at once when the power is there', () => {
    const result = promote(createArmyState(UNIT_TIERS[3]!.promotionThreshold, 0));
    expect(result.toTierIndex).toBe(3);
    expect(result.steps).toBe(3);
  });

  it('stops at the highest tier instead of running off the table', () => {
    const huge = createArmyState(Number.MAX_SAFE_INTEGER, 0);
    const result = promote(huge);
    expect(result.toTierIndex).toBe(MAX_TIER_INDEX);
    expect(canPromote(result.state)).toBe(false);
  });

  /**
   * Beförderung bringt die ANGEZEIGTE Truppenstärke zurück in einen
   * lesbaren Bereich: aus „×500 Militia" wird „×5 Riflemen".
   */
  it('brings the unit count back to a readable squad', () => {
    const overflowing = createArmyState(50_000, 0);
    expect(overflowing.unitCount).toBe(50_000);
    // Gezeichnet wird ohnehin nur das Budget — die Zahl bleibt trotzdem echt.
    expect(overflowing.displayCount).toBe(DISPLAY_CAPS.alliesHard);

    const after = promote(overflowing).state;
    expect(after.unitCount).toBe(500);
    expect(after.combatPower).toBe(50_000);
  });

  /**
   * Bei 100:1 sitzt die gezeichnete Truppe lange am Renderbudget fest. Die
   * echte Zahl muss in dieser Strecke weiterlaufen, sonst sieht der Spieler
   * Stillstand, wo sich seine Stärke verachtfacht.
   */
  it('keeps growth visible in the number while the crowd is capped', () => {
    const early = createArmyState(200, 0);
    const late = createArmyState(1000, 0);
    expect(early.displayCount).toBe(late.displayCount);
    expect(late.unitCount).toBeGreaterThan(early.unitCount * 4);
  });

  it('never draws more figures than the render budget allows', () => {
    for (const power of [1, 139, 140, 141, 5_000, 1e6, 1e9]) {
      for (let tier = 0; tier < UNIT_TIERS.length; tier += 1) {
        const state = createArmyState(power, tier);
        expect(state.displayCount).toBeLessThanOrEqual(DISPLAY_CAPS.alliesHard);
        expect(state.displayCount).toBeLessThanOrEqual(state.unitCount);
      }
    }
  });

  it('keeps the leftover as visible progress, never as loss', () => {
    // 1.250 Basispunkte: 12 Riflemen und ein halber.
    const after = promote(createArmyState(1250, 0)).state;
    expect(after.tierIndex).toBe(1);
    expect(after.displayCount).toBe(12);
    expect(after.overflowProgress).toBeCloseTo(0.5);
    // Gegenprobe: sichtbare Einheiten plus Rest ergeben die volle Stärke.
    const reconstructed =
      (after.displayCount + after.overflowProgress) * getTier(1).powerPerUnit;
    expect(reconstructed).toBeCloseTo(1250);
  });
});

describe('ArmyManager promotion', () => {
  it('promotes only when asked, not on every gate', () => {
    const army = new ArmyManager(new EventBus(), 5000);
    expect(army.current.tierIndex).toBe(0);
    expect(army.promotionPending).toBe(true);

    army.applyGate({ kind: 'add', value: 10, notation: 'flat', weight: 1 });
    // Ein Tor allein befördert nicht — das gehört an den Kontrollpunkt.
    expect(army.current.tierIndex).toBe(0);

    expect(army.tryPromote()).toBe(1);
    expect(army.current.tierIndex).toBe(1);
  });

  it('announces the promotion once', () => {
    const bus = new EventBus();
    const seen = vi.fn();
    bus.on('army:promoted', seen);
    const army = new ArmyManager(bus, 5000);

    army.tryPromote();
    army.tryPromote();

    expect(seen).toHaveBeenCalledTimes(1);
    expect(seen.mock.calls[0]![0]).toEqual({ fromTierIndex: 0, toTierIndex: 1 });
  });

  it('remembers the highest tier reached even after heavy losses', () => {
    const army = new ArmyManager(new EventBus(), 5000);
    army.tryPromote();
    army.damage(4999);
    expect(army.current.tierIndex).toBe(1);
    expect(army.peakTierIndex).toBe(1);
  });

  it('makes additive gates scale with the new tier', () => {
    const army = new ArmyManager(new EventBus(), 5000);
    army.tryPromote();
    // "+10" heisst jetzt zehn RIFLEMEN, also 1.000 Basispunkte.
    army.applyGate({ kind: 'add', value: 10, notation: 'flat', weight: 1 });
    expect(army.combatPower).toBe(6000);
  });
});
