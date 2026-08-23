import type { GateEffect } from '../config/gates';
import {
  GATE_LAYOUT,
  GATE_PAIRING,
  NEGATIVE_GATES,
  POSITIVE_GATES,
  nominalFactor,
} from '../config/gates';
import { Random } from '../util/Random';

/** Wie ein Torpaar zusammengesetzt ist — bestimmt, was auf dem Spiel steht. */
export type GatePairing = 'both-positive' | 'mixed' | 'both-negative';

export interface GateInstance {
  /** Fortlaufende Nummer — dient dem Renderer als stabile Identität. */
  id: number;
  pairing: GatePairing;
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
      this.gates.push(this.createGate(this.nextGateZ, this.nextId));
      this.nextGateZ += GATE_LAYOUT.spacingMeters;
    }
  }

  private cleanup(distance: number): void {
    const cutoff = distance - GATE_LAYOUT.cleanupMeters;
    if (this.gates.length > 0 && this.gates[0]!.z < cutoff) {
      this.gates = this.gates.filter((gate) => gate.z >= cutoff);
    }
  }

  private createGate(z: number, index: number): GateInstance {
    const pairing = this.choosePairing(index);
    const [a, b] = this.buildSides(pairing);

    // Seite auswürfeln, sonst läge die bessere Wahl immer links und der
    // Spieler müsste nicht mehr hinsehen.
    const aLeft = this.rng.chance(0.5);
    return {
      id: this.nextId++,
      pairing,
      z,
      left: aLeft ? a : b,
      right: aLeft ? b : a,
      resolved: false,
      takenSide: null,
    };
  }

  /**
   * Die ersten Tore einer Runde sind nie eine Falle: wer bestraft wird,
   * bevor er die Regeln kennt, hört auf zu spielen.
   */
  private choosePairing(index: number): GatePairing {
    if (index < GATE_LAYOUT.safeGates) return 'both-positive';
    const roll = this.rng.next();
    if (roll < GATE_PAIRING.bothPositive) return 'both-positive';
    if (roll < GATE_PAIRING.bothPositive + GATE_PAIRING.mixed) return 'mixed';
    return 'both-negative';
  }

  /**
   * Baut zwei Seiten, die sich spürbar unterscheiden. Zwei gleichwertige
   * Seiten wären keine Entscheidung, sondern eine Formalität.
   */
  private buildSides(pairing: GatePairing): [GateEffect, GateEffect] {
    if (pairing === 'mixed') {
      return [this.pick(POSITIVE_GATES), this.pick(NEGATIVE_GATES)];
    }
    const pool = pairing === 'both-positive' ? POSITIVE_GATES : NEGATIVE_GATES;
    const first = this.pick(pool);
    return [first, this.pickDistinctFrom(first, pool)];
  }

  /**
   * Zweite Seite aus demselben Topf, aber deutlich anders stark. Der
   * Mindestabstand verhindert Paare wie „×0.8" gegen „−20%" — dieselbe
   * Wirkung in zwei Schreibweisen, bei der jede Wahl gleich ausgeht.
   */
  private pickDistinctFrom(
    first: GateEffect,
    pool: readonly GateEffect[],
  ): GateEffect {
    const factor = nominalFactor(first);
    const candidates = pool.filter((effect) => {
      const other = nominalFactor(effect);
      const ratio = other > factor ? other / factor : factor / other;
      return ratio >= 1.25;
    });
    if (candidates.length === 0) return first;
    return this.rng.weighted(candidates, (effect) => effect.weight);
  }

  private pick(pool: readonly GateEffect[]): GateEffect {
    return this.rng.weighted(pool, (effect) => effect.weight);
  }

}
