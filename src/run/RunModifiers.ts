import type { UpgradeKind } from '../config/upgrades';
import { MODIFIER_CAPS } from '../config/upgrades';
import { clamp } from '../util/math';

/**
 * Alles, was gewählte Aufwertungen an der laufenden Runde verändern.
 *
 * Ein Objekt, das jedes System befragt, statt verstreuter Sonderfälle. Die
 * Werte gelten NUR für diese Runde; dauerhafte Meta-Upgrades sind Phase 6
 * und leben im Spielstand.
 */
export class RunModifiers {
  /** Faktor auf den Ertrag positiver Tore. 1 = unverändert. */
  gateGain = 1;
  /** Anteil, um den Torstrafen abgeschwächt werden. 0 = volle Wirkung. */
  gateShield = 0;
  /** Faktor auf die Vorwärtsgeschwindigkeit. */
  speed = 1;
  /** Faktor auf die Lenkgeschwindigkeit. */
  steering = 1;
  /** Anteil, um den Beförderungsschwellen sinken. */
  promotionDiscount = 0;

  /**
   * Kampfwerte. Noch ohne Wirkung — es gibt keine Gegner. Sie stehen hier,
   * damit das Kampfsystem in Phase 4 nur lesen muss, statt das Modell
   * umzubauen.
   */
  fireRate = 1;
  damage = 1;
  armor = 0;

  /** Was bereits gewählt wurde — für Anzeige und Stapel-Grenzen. */
  readonly taken: UpgradeKind[] = [];

  reset(): void {
    this.gateGain = 1;
    this.gateShield = 0;
    this.speed = 1;
    this.steering = 1;
    this.promotionDiscount = 0;
    this.fireRate = 1;
    this.damage = 1;
    this.armor = 0;
    this.taken.length = 0;
  }

  /**
   * Wendet eine gewählte Karte an.
   *
   * `recruit` wirkt sofort auf die Armee und nicht auf die Modifikatoren —
   * der Aufrufer bekommt die Zahl zurück und verrechnet sie.
   *
   * @returns Anzahl sofort zu rekrutierender Einheiten (0 bei allen anderen).
   */
  apply(kind: UpgradeKind, magnitude: number): number {
    this.taken.push(kind);
    switch (kind) {
      case 'recruit':
        return magnitude;
      case 'gate-gain':
        this.gateGain += magnitude;
        return 0;
      case 'gate-shield':
        this.gateShield = clamp(this.gateShield + magnitude, 0, MODIFIER_CAPS.gateShield);
        return 0;
      case 'speed':
        this.speed = clamp(this.speed + magnitude, 1, MODIFIER_CAPS.speed);
        return 0;
      case 'steering':
        this.steering = clamp(this.steering + magnitude, 1, MODIFIER_CAPS.steering);
        return 0;
      case 'promotion':
        this.promotionDiscount = clamp(
          this.promotionDiscount + magnitude,
          0,
          MODIFIER_CAPS.promotionDiscount,
        );
        return 0;
    }
  }
}
