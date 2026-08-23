import { describe, expect, it } from 'vitest';
import { GateSystem } from '../src/run/GateSystem';
import { ArmyManager } from '../src/army/ArmyManager';
import { EventBus } from '../src/core/EventBus';
import { GATE_LAYOUT } from '../src/config/gates';
import { ARMY, MOVEMENT, RUN } from '../src/config/gameBalance';
import { Random } from '../src/util/Random';
import { MAX_TIER_INDEX, getTier } from '../src/config/unitTiers';

import { powerAfterEffect } from '../src/army/CombatPowerSystem';

import type { GateInstance } from '../src/run/GateSystem';

/** Liefert die Lateralposition, die der Spieler an diesem Tor einnimmt. */
type Chooser = (gate: GateInstance, power: number) => number;

/**
 * Simuliert eine Fahrt über `gateCount` Tore, samt Beförderung an jedem
 * Kontrollpunkt — sonst bliebe die Armee künstlich auf Tier 1 stecken und
 * die gemessene Kurve hätte mit dem Spiel nichts zu tun.
 */
function simulate(seed: number, gateCount: number, chooser: Chooser): number {
  const army = new ArmyManager(new EventBus(), ARMY.startCombatPower);
  const gates = new GateSystem(seed);
  const end = GATE_LAYOUT.firstGateMeters + gateCount * GATE_LAYOUT.spacingMeters;
  let sector = 0;

  for (let d = 0; d <= end; d += 1) {
    const upcoming = gates.active.find((gate) => !gate.resolved && gate.z - d < 12);
    const x = upcoming ? chooser(upcoming, army.combatPower) : 0;
    gates.update(d, x, (effect) => army.applyGate(effect));

    const next = Math.floor(d / RUN.sectorLengthMeters);
    if (next !== sector) {
      sector = next;
      army.tryPromote();
    }
    if (army.defeated) return 0;
  }
  return army.combatPower;
}

/** Zählt, wie oft in einer Fahrt befördert wurde. */
function countPromotions(seed: number, gateCount: number, chooser: Chooser): number {
  return promotionSeconds(seed, gateCount, chooser).length;
}

/** Sekunde der ersten Beförderung; -1, wenn keine fiel. */
function firstPromotionSecond(seed: number, chooser: Chooser): number {
  return promotionSeconds(seed, 50, chooser)[0] ?? -1;
}

function promotionSeconds(seed: number, gateCount: number, chooser: Chooser): number[] {
  const army = new ArmyManager(new EventBus(), ARMY.startCombatPower);
  const gates = new GateSystem(seed);
  const end = GATE_LAYOUT.firstGateMeters + gateCount * GATE_LAYOUT.spacingMeters;
  const seconds: number[] = [];
  let sector = 0;
  for (let d = 0; d <= end; d += 1) {
    const upcoming = gates.active.find((gate) => !gate.resolved && gate.z - d < 12);
    const x = upcoming ? chooser(upcoming, army.combatPower) : 0;
    gates.update(d, x, (effect) => army.applyGate(effect));
    const next = Math.floor(d / RUN.sectorLengthMeters);
    if (next !== sector) {
      sector = next;
      if (army.tryPromote() > 0) seconds.push(d / MOVEMENT.forwardSpeed);
    }
  }
  return seconds;
}

/** Wie das obige, liefert aber das erreichte Tier statt der Stärke. */
function simulateTier(seed: number, gateCount: number, chooser: Chooser): number {
  const army = new ArmyManager(new EventBus(), ARMY.startCombatPower);
  const gates = new GateSystem(seed);
  const end = GATE_LAYOUT.firstGateMeters + gateCount * GATE_LAYOUT.spacingMeters;
  let sector = 0;
  for (let d = 0; d <= end; d += 1) {
    const upcoming = gates.active.find((gate) => !gate.resolved && gate.z - d < 12);
    const x = upcoming ? chooser(upcoming, army.combatPower) : 0;
    gates.update(d, x, (effect) => army.applyGate(effect));
    const next = Math.floor(d / RUN.sectorLengthMeters);
    if (next !== sector) {
      sector = next;
      army.tryPromote();
    }
  }
  return army.current.tierIndex;
}

/**
 * Bewertet beide Seiten an der ECHTEN aktuellen Stärke. Bei gemischten
 * Schreibweisen hängt die richtige Wahl davon ab: „+50" schlägt „×1.5" bei
 * 40 Soldaten, verliert dagegen bei 4.000.
 */
function betterSideIsLeft(gate: GateInstance, power: number): boolean {
  const perUnit = getTier(0).powerPerUnit;
  return (
    powerAfterEffect(power, gate.left, perUnit) >=
    powerAfterEffect(power, gate.right, perUnit)
  );
}

const perfect: Chooser = (gate, power) => (betterSideIsLeft(gate, power) ? -3 : 3);
const worst: Chooser = (gate, power) => (betterSideIsLeft(gate, power) ? 3 : -3);

describe('gate balance', () => {
  /** Median über viele Seeds — Multiplikatoren streuen zu stark für einen. */
  function medianPower(gateCount: number, chooser: Chooser): number {
    const runs = Array.from({ length: 40 }, (_, seed) => simulate(seed, gateCount, chooser));
    runs.sort((a, b) => a - b);
    return runs[Math.floor(runs.length / 2)]!;
  }

  /**
   * Beförderung ist der Takt der Runde, nicht ihr Höhepunkt.
   *
   * Die Beschwerde aus dem Spieltest war, dass bei vollem Bildschirm nichts
   * passiert. Also muss die erste Beförderung früh fallen und danach
   * regelmäßig — mehrere pro Runde.
   */
  it('promotes early and repeatedly', () => {
    const counts = Array.from({ length: 40 }, (_, seed) =>
      countPromotions(seed, 50, perfect),
    ).sort((a, b) => a - b);
    const median = counts[Math.floor(counts.length / 2)]!;
    expect(median).toBeGreaterThanOrEqual(4);

    // Und die erste kommt nicht erst kurz vor Schluss.
    const firstAt = Array.from({ length: 40 }, (_, seed) => firstPromotionSecond(seed, perfect))
      .filter((v) => v > 0)
      .sort((a, b) => a - b);
    expect(firstAt[Math.floor(firstAt.length / 2)]!).toBeLessThan(60);
  });

  /**
   * Wachstum muss sich potenzieren, nicht aufaddieren — sonst gibt es die
   * versprochene Machtfantasie nicht.
   */
  /**
   * Die Tier-Leiter darf in einer einzigen Runde nicht aufgebraucht werden.
   * Die obersten Stufen sind laut Spezifikation für den Endlosmodus
   * reserviert — wer sie nach vier Minuten erreicht, hat dort nichts mehr
   * vor sich.
   */
  it('leaves the top tiers for endless mode', () => {
    // ~50 Tore sind gut vier Minuten, also eine lange reguläre Runde.
    const tiers = Array.from({ length: 40 }, (_, seed) => simulateTier(seed, 50, perfect));
    tiers.sort((a, b) => a - b);
    const median = tiers[Math.floor(tiers.length / 2)]!;
    expect(median).toBeGreaterThanOrEqual(3);
    expect(median).toBeLessThanOrEqual(MAX_TIER_INDEX - 3);
  });

  it('compounds rather than adding up', () => {
    const twenty = medianPower(20, perfect);
    const forty = medianPower(40, perfect);
    // Doppelte Strecke, weit mehr als doppelte Stärke.
    expect(forty / twenty).toBeGreaterThan(4);
  });

  /** Und schlechte Entscheidungen müssen wehtun — sonst ist die Wahl egal. */
  it('punishes bad choices', () => {
    for (const seed of [1, 2, 3, 7, 99]) {
      expect(simulate(seed, 25, worst)).toBeLessThan(simulate(seed, 25, perfect));
    }
  });

  /**
   * Ein Tor darf die Runde nie beenden. Es ist eine Entscheidung, kein Tod:
   * ein "×0.05" bei acht Soldaten würde sonst in der zwanzigsten Sekunde
   * eine Runde auslöschen, bevor der Spieler die Regeln kennt.
   */
  it('does not wipe out a player who steers blindly through the first gates', () => {
    const rng = new Random(1234);
    let survived = 0;
    const runs = 200;
    for (let i = 0; i < runs; i += 1) {
      const power = simulate(i, 8, () => (rng.chance(0.5) ? -3 : 3));
      if (power > 0) survived += 1;
    }
    expect(survived).toBe(runs);
  });

  /**
   * Additive Tore zählen in Einheiten des aktuellen Tiers. Ohne diese
   * Kopplung verlöre "+20" ab dem zweiten Tier jede Bedeutung.
   */
  it('keeps additive gates relevant at higher tiers', () => {
    const bus = new EventBus();
    const plus20 = { kind: 'add' as const, value: 20, notation: 'flat' as const, weight: 1 };

    const tier1 = new ArmyManager(bus, 100);
    tier1.applyGate(plus20);
    expect(tier1.combatPower).toBe(120);

    // Dieselbe Armee nach Beförderung: "+20" muss 20 Einheiten des neuen
    // Tiers bringen, nicht 20 Basispunkte.
    const promoted = new ArmyManager(bus, 10_000);
    promoted.tryPromote();
    const perUnit = getTier(promoted.current.tierIndex).powerPerUnit;
    expect(perUnit).toBeGreaterThan(1);
    promoted.applyGate(plus20);
    expect(promoted.combatPower).toBe(10_000 + 20 * perUnit);
  });
});
