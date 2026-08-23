import { MOVEMENT } from '../config/gameBalance';
import { clamp, damp, moveTowards } from '../util/math';

/**
 * Bewegung des Armee-Ankers: automatisch vorwaerts, lateral vom Spieler
 * gesteuert. Bewusst frei von Babylon, damit die Fahrphysik ohne Browser
 * testbar bleibt (PLAN.md Regel 2).
 *
 * Zwei Glaettungsstufen liegen hintereinander:
 *  1. `desiredX` folgt der Eingabe mit begrenzter Geschwindigkeit
 *     (`lateralSpeed`) — dadurch fuehlt sich die Armee traege/schwer an
 *     statt teleportiert.
 *  2. `x` folgt `desiredX` exponentiell geglaettet — nimmt Ecken aus der
 *     Bewegung und laesst die Formation nachziehen.
 */
export class RunKinematics {
  /** Zurueckgelegte Strecke in Metern seit Rundenstart. */
  distance = 0;
  /** Aktuelle Lateralposition in Metern. */
  x = 0;
  /** Zwischenziel der Lateralbewegung in Metern. */
  private desiredX = 0;
  /** Meter pro Sekunde; von Effekten spaeter modifizierbar. */
  forwardSpeed = MOVEMENT.forwardSpeed;

  /** Lateralgeschwindigkeit in m/s — treibt Neigung und Formation. */
  lateralVelocity = 0;

  reset(): void {
    this.distance = 0;
    this.x = 0;
    this.desiredX = 0;
    this.lateralVelocity = 0;
    this.forwardSpeed = MOVEMENT.forwardSpeed;
  }

  /**
   * @param inputLateral       normalisierte Eingabe in [-1, 1]
   * @param dt                 Schrittweite in Sekunden
   * @param formationHalfWidth halbe Breite der Truppe in Metern
   */
  update(inputLateral: number, dt: number, formationHalfWidth = 0): void {
    // Der Anker darf nur so weit an den Rand, dass die AUSSENSTE Reihe noch
    // auf dem Asphalt steht. Ohne diese Kopplung wächst die Truppe durch die
    // Leitplanke hindurch, sobald sie breiter wird.
    const limit = Math.max(
      0,
      Math.min(MOVEMENT.laneHalfWidth, MOVEMENT.roadHalfWidth - formationHalfWidth - 0.4),
    );
    const targetX = clamp(inputLateral, -1, 1) * limit;
    this.desiredX = moveTowards(this.desiredX, targetX, MOVEMENT.lateralSpeed * dt);

    const previousX = this.x;
    this.x = clamp(
      damp(this.x, this.desiredX, MOVEMENT.lateralSmoothing, dt),
      -limit,
      limit,
    );
    this.lateralVelocity = dt > 0 ? (this.x - previousX) / dt : 0;

    this.distance += this.forwardSpeed * dt;
  }

  /** Normalisierte Lateralposition [-1, 1] — fuer Kamera und HUD. */
  get normalizedX(): number {
    return this.x / MOVEMENT.laneHalfWidth;
  }
}
