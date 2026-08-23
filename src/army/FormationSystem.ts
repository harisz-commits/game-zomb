import { MOVEMENT } from '../config/gameBalance';
import { clamp } from '../util/math';

/**
 * Anordnung der sichtbaren Einheiten.
 *
 * Verwendet eine Phyllotaxis-Verteilung (der goldene Winkel, mit dem
 * Sonnenblumenkerne sitzen): sie füllt eine Fläche für JEDE Anzahl
 * gleichmäßig, ohne Lücken oder Reihenartefakte, und wächst stetig — beim
 * Hinzufügen einer Einheit springt keine andere weg.
 *
 * Die Scheibe wird zur Ellipse gestaucht: quer zur Fahrbahn schmal, nach
 * hinten lang. Eine runde Formation würde bei großer Armee über die
 * Fahrbahnränder quellen; so wächst die Truppe stattdessen in die Tiefe und
 * bleibt lenkbar.
 */

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
/** Grundabstand zwischen zwei Einheiten in Metern. */
const SPACING = 0.58;
const X_SCALE = 0.62;
const Z_SCALE = 1.0;


export interface FormationSlot {
  x: number;
  z: number;
  /** Phasenversatz [0, 2π) für den Laufzyklus — bricht den Gleichschritt. */
  phase: number;
}

/**
 * Deterministischer Versatz pro Index. Kein `Math.random()`: die Formation
 * darf sich nicht bei jedem Frame neu würfeln, sonst zittert die Truppe.
 */
function jitter(index: number, salt: number): number {
  const value = Math.sin(index * 12.9898 + salt * 78.233) * 43758.5453;
  return value - Math.floor(value) - 0.5;
}

/**
 * Berechnet die Formation für `count` Einheiten.
 *
 * Das Ergebnis wird zwischengespeichert und nur neu berechnet, wenn sich die
 * Anzahl ändert — pro Frame anfallen würde die Trigonometrie sonst für jede
 * Einheit erneut.
 */
export class FormationLayout {
  private slots: FormationSlot[] = [];
  private cachedCount = -1;

  get count(): number {
    return this.slots.length;
  }

  /** Halbe Breite der aktuellen Formation in Metern. */
  halfWidth = 0;
  /** Tiefe der aktuellen Formation in Metern. */
  depth = 0;

  update(count: number): readonly FormationSlot[] {
    if (count === this.cachedCount) return this.slots;
    this.cachedCount = count;
    this.slots = buildSlots(count);

    let maxX = 0;
    let maxZ = 0;
    for (const slot of this.slots) {
      maxX = Math.max(maxX, Math.abs(slot.x));
      maxZ = Math.max(maxZ, Math.abs(slot.z));
    }
    this.halfWidth = maxX;
    this.depth = maxZ * 2;
    return this.slots;
  }
}

function buildSlots(count: number): FormationSlot[] {
  if (count <= 0) return [];

  // Wie weit die Scheibe bei dieser Anzahl reichen würde …
  const rawHalfWidth = SPACING * Math.sqrt(count) * X_SCALE;
  const allowed = MOVEMENT.formationMaxHalfWidth;
  // … und wie stark sie dafür quer gestaucht werden muss.
  const squeeze = rawHalfWidth > allowed ? allowed / rawHalfWidth : 1;

  const slots: FormationSlot[] = new Array(count);
  for (let i = 0; i < count; i += 1) {
    const radius = SPACING * Math.sqrt(i + 0.5);
    const angle = i * GOLDEN_ANGLE;
    slots[i] = {
      // Der Versatz kommt NACH dem Stauchen dazu und könnte die Grenze
      // sonst um seinen eigenen Betrag überschreiten — daher hart begrenzt.
      x: clamp(
        Math.cos(angle) * radius * X_SCALE * squeeze + jitter(i, 1) * 0.12,
        -allowed,
        allowed,
      ),
      z: Math.sin(angle) * radius * Z_SCALE + jitter(i, 2) * 0.16,
      phase: (jitter(i, 3) + 0.5) * Math.PI * 2,
    };
  }
  return slots;
}
