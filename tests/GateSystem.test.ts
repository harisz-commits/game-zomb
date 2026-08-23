import { describe, expect, it, vi } from 'vitest';
import { GateSystem } from '../src/run/GateSystem';
import { GATE_LAYOUT, gateLabel } from '../src/config/gates';
import { RENDER } from '../src/config/gameBalance';
import { ArmyManager } from '../src/army/ArmyManager';
import { EventBus } from '../src/core/EventBus';

/** Fährt die Strecke in kleinen Schritten ab, wie der echte Loop es tut. */
function drive(
  system: GateSystem,
  toMeters: number,
  x: number,
  apply: (effect: { kind: string; value: number }) => void = () => {},
): void {
  for (let d = 0; d <= toMeters; d += 1) system.update(d, x, apply);
}

describe('GateSystem', () => {
  it('places the first gate where the player can see it coming', () => {
    const system = new GateSystem(1);
    system.update(0, 0, () => {});
    expect(system.active[0]!.z).toBe(GATE_LAYOUT.firstGateMeters);
  });

  it('never pops a gate into view — new ones appear beyond the fog', () => {
    const system = new GateSystem(2);
    const seen = new Set<number>();

    // Der Rundenstart baut die Welt auf einen Schlag auf; erst danach gilt
    // die Invariante.
    system.update(0, 0, () => {});
    for (const gate of system.active) seen.add(gate.id);
    const initial = seen.size;

    for (let d = 1; d <= 1500; d += 1) {
      system.update(d, 0, () => {});
      for (const gate of system.active) {
        if (seen.has(gate.id)) continue;
        seen.add(gate.id);
        // Im Moment seiner Entstehung muss das Tor hinter der Nebelwand
        // liegen, sonst erscheint es dem Spieler aus dem Nichts.
        expect(gate.z - d).toBeGreaterThanOrEqual(RENDER.fogEnd);
      }
    }
    expect(seen.size - initial).toBeGreaterThan(20);
  });

  it('triggers each gate exactly once', () => {
    const system = new GateSystem(3);
    const apply = vi.fn();
    drive(system, 200, -2, apply);
    const resolved = system.active.filter((gate) => gate.resolved).length;
    // Aufgeräumte Tore zählen mit, deshalb >= statt ===.
    expect(apply.mock.calls.length).toBeGreaterThanOrEqual(resolved);

    const callsBefore = apply.mock.calls.length;
    drive(system, 200, -2, apply);
    expect(apply.mock.calls.length).toBe(callsBefore);
  });

  it('applies the side the player actually drove through', () => {
    const left = new GateSystem(7);
    const right = new GateSystem(7);
    const leftHits: unknown[] = [];
    const rightHits: unknown[] = [];

    drive(left, 40, -3, (effect) => leftHits.push(effect));
    drive(right, 40, 3, (effect) => rightHits.push(effect));

    const gate = left.active[0]!;
    expect(leftHits[0]).toEqual(gate.left);
    expect(rightHits[0]).toEqual(gate.right);
    expect(left.active[0]!.takenSide).toBe('left');
    expect(right.active[0]!.takenSide).toBe('right');
  });

  it('offers two different sides so the choice matters', () => {
    const system = new GateSystem(11);
    system.update(0, 0, () => {});
    let identical = 0;
    for (const gate of system.active) {
      if (gateLabel(gate.left) === gateLabel(gate.right)) identical += 1;
    }
    expect(identical).toBe(0);
  });

  it('is reproducible from its seed', () => {
    const a = new GateSystem(4242);
    const b = new GateSystem(4242);
    a.update(0, 0, () => {});
    b.update(0, 0, () => {});
    expect(a.active.map((g) => [g.z, gateLabel(g.left), gateLabel(g.right)])).toEqual(
      b.active.map((g) => [g.z, gateLabel(g.left), gateLabel(g.right)]),
    );
  });

  it('does not grow without bound over a long run', () => {
    const system = new GateSystem(5);
    drive(system, 3000, 0);
    const span = GATE_LAYOUT.lookaheadMeters + GATE_LAYOUT.cleanupMeters;
    expect(system.active.length).toBeLessThanOrEqual(
      Math.ceil(span / GATE_LAYOUT.spacingMeters) + 2,
    );
  });
});

describe('ArmyManager with gates', () => {
  it('adds and multiplies power, keeping soldiers whole', () => {
    const army = new ArmyManager(new EventBus(), 10);
    army.applyGate({ kind: 'add', value: 15, notation: 'factor', weight: 1 });
    expect(army.combatPower).toBe(25);
    army.applyGate({ kind: 'multiply', value: 3, notation: 'factor', weight: 1 });
    expect(army.combatPower).toBe(75);
    army.applyGate({ kind: 'multiply', value: 0.5, notation: 'factor', weight: 1 });
    expect(army.combatPower).toBe(37);
    expect(Number.isInteger(army.combatPower)).toBe(true);
  });

  it('cannot be pushed below zero', () => {
    const army = new ArmyManager(new EventBus(), 10);
    army.damage(999);
    expect(army.combatPower).toBe(0);
    expect(army.defeated).toBe(true);
  });

  it('scales penalties with army size instead of flat damage', () => {
    const bus = new EventBus();
    const halve = { kind: 'multiply' as const, value: 0.5, notation: 'factor' as const, weight: 1 };
    const small = new ArmyManager(bus, 12);
    const large = new ArmyManager(bus, 12_000);
    small.applyGate(halve);
    large.applyGate(halve);
    // Dieselbe relative Einbusse, unabhaengig von der Spielphase - und die
    // kleine Armee ueberlebt sie.
    expect(small.combatPower).toBe(6);
    expect(large.combatPower).toBe(6000);
    expect(small.defeated).toBe(false);
  });

  it('remembers the peak even after losses', () => {
    const army = new ArmyManager(new EventBus(), 10);
    army.applyGate({ kind: 'multiply', value: 3, notation: 'factor', weight: 1 });
    army.applyGate({ kind: 'add', value: -25, notation: 'flat', weight: 1 });
    expect(army.combatPower).toBe(5);
    expect(army.peakCombatPower).toBe(30);
  });

  it('announces every change on the bus', () => {
    const bus = new EventBus();
    const seen = vi.fn();
    bus.on('army:changed', seen);
    const army = new ArmyManager(bus, 10);
    army.applyGate({ kind: 'add', value: 5, notation: 'factor', weight: 1 });
    expect(seen).toHaveBeenCalledTimes(1);
    expect(seen.mock.calls[0]![0]).toMatchObject({ combatPower: 15, displayCount: 15 });
  });
});
