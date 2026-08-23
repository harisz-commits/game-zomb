import type { GateEffect } from '../config/gates';
import {
  GATE_LAYOUT,
  NEGATIVE_GATES,
  POSITIVE_GATES,
} from '../config/gates';
import { Random } from '../util/Random';

export interface GateInstance {
  /** Fortlaufende Nummer — dient dem Renderer als stabile Identität. */
  id: number;
  /** Weltposition entlang der Fahrstrecke in Metern. */
  z: number;
  left: GateEffect;
  right: GateEffect;
  /** Bereits durchfahren? */
  resolved: boolean;
  /** Welche Seite genommen wurde — nur für die Darstellung. */
  takenSide: 'left' | 'right' | null;
}

/**
 * Erzeugt Gates im Voraus und löst sie beim Durchfahren aus.
 *
 * Frei von Babylon: die Entscheidungslogik ist der Teil, der stimmen muss,
 * und wird deshalb ohne Browser getestet. Der Renderer liest den Zustand nur.
 *
 * Erzeugung erfolgt aus einem Seed statt aus `Math.random()`, damit eine
 * Runde reproduzierbar ist (PLAN.md R7).
 */
export class GateSystem {
  private readonly rng: Random;
  private gates: GateInstance[] = [];
  private nextGateZ = GATE_LAYOUT.firstGateMeters;
  private nextId = 0;

  constructor(seed: number) {
    this.rng = new Random(seed);
  }

  get active(): readonly GateInstance[] {
    return this.gates;
  }

  /**
   * @param distance zurückgelegte Strecke der Armee in Metern
   * @param x        Lateralposition der Armee in Metern
   * @param apply    wird für die gewählte Seite genau einmal aufgerufen
   */
  update(distance: number, x: number, apply: (effect: GateEffect) => void): void {
    this.generateAhead(distance);

    for (const gate of this.gates) {
      if (gate.resolved || distance < gate.z) continue;
      gate.resolved = true;
      // Auf der Mittellinie gewinnt links — willkürlich, aber verlässlich:
      // ein Zufallsentscheid wäre für den Spieler nicht nachvollziehbar.
      const side = x < 0 ? 'left' : 'right';
      gate.takenSide = side;
      apply(side === 'left' ? gate.left : gate.right);
    }

    this.cleanup(distance);
  }

  private generateAhead(distance: number): void {
    const horizon = distance + GATE_LAYOUT.lookaheadMeters;
    while (this.nextGateZ <= horizon) {
      this.gates.push(this.createGate(this.nextGateZ));
      this.nextGateZ += GATE_LAYOUT.spacingMeters;
    }
  }

  private cleanup(distance: number): void {
    const cutoff = distance - GATE_LAYOUT.cleanupMeters;
    if (this.gates.length > 0 && this.gates[0]!.z < cutoff) {
      this.gates = this.gates.filter((gate) => gate.z >= cutoff);
    }
  }

  private createGate(z: number): GateInstance {
    const strong = this.pick(POSITIVE_GATES);
    const weak = this.rng.chance(GATE_LAYOUT.bothPositiveChance)
      ? this.pickWeakerThan(strong)
      : this.pick(NEGATIVE_GATES);

    // Seite auswürfeln, sonst läge die gute Wahl immer links und der Spieler
    // müsste nicht mehr hinsehen.
    const strongLeft = this.rng.chance(0.5);
    return {
      id: this.nextId++,
      z,
      left: strongLeft ? strong : weak,
      right: strongLeft ? weak : strong,
      resolved: false,
      takenSide: null,
    };
  }

  private pick(pool: readonly GateEffect[]): GateEffect {
    return this.rng.weighted(pool, (effect) => effect.weight);
  }

  /**
   * Sucht eine deutlich schwächere positive Seite. Gibt es keine (die
   * schwächste wurde gezogen), muss eine Strafe die Wahl tragen.
   */
  private pickWeakerThan(strong: GateEffect): GateEffect {
    const weaker = POSITIVE_GATES.filter((effect) => effect.appeal < strong.appeal - 1);
    if (weaker.length === 0) return this.pick(NEGATIVE_GATES);
    return this.rng.weighted(weaker, (effect) => effect.weight);
  }
}
