import type { ArmyState } from '../core/Types';
import type { EventBus } from '../core/EventBus';
import type { GateEffect } from '../config/gates';
import { getTier } from '../config/unitTiers';
import { ARMY } from '../config/gameBalance';
import { createArmyState, isDefeated, powerAfterEffect } from './CombatPowerSystem';
import { canPromote, promote } from './PromotionSystem';

/**
 * Hält den Armeezustand und ist die einzige Stelle, die ihn verändert.
 *
 * Jede Änderung geht durch `setPower`, damit die abgeleiteten Felder nie
 * veralten und `army:changed` verlässlich feuert.
 */
export class ArmyManager {
  private state: ArmyState;
  private peakPower: number;
  private peakTier: number;

  constructor(
    private readonly bus: EventBus,
    startPower: number = ARMY.startCombatPower,
  ) {
    this.state = createArmyState(startPower, 0);
    this.peakPower = this.state.combatPower;
    this.peakTier = 0;
  }

  get current(): Readonly<ArmyState> {
    return this.state;
  }

  get combatPower(): number {
    return this.state.combatPower;
  }

  get displayCount(): number {
    return this.state.displayCount;
  }

  get unitCount(): number {
    return this.state.unitCount;
  }

  get tierName(): string {
    return getTier(this.state.tierIndex).name;
  }

  get peakCombatPower(): number {
    return this.peakPower;
  }

  get defeated(): boolean {
    return isDefeated(this.state, ARMY.defeatCombatPower);
  }

  get peakTierIndex(): number {
    return this.peakTier;
  }

  reset(startPower: number = ARMY.startCombatPower): void {
    this.state = createArmyState(startPower, 0);
    this.peakPower = this.state.combatPower;
    this.peakTier = 0;
    this.bus.emit('army:changed', this.state);
  }

  /** Wendet eine Gate-Entscheidung an. Rechnung siehe `powerAfterEffect`. */
  applyGate(effect: GateEffect): void {
    const perUnit = getTier(this.state.tierIndex).powerPerUnit;
    const next = powerAfterEffect(this.state.combatPower, effect, perUnit);
    // Ein Tor darf die Runde nicht beenden. Es ist eine Entscheidung, kein
    // Tod — sonst löscht ein "×0.05" bei acht Soldaten in der zwanzigsten
    // Sekunde eine Runde aus, bevor der Spieler die Regeln kennt. Sterben
    // soll man an Gegnern (Phase 4), nicht an Arithmetik.
    this.setPower(this.state.combatPower > 0 ? Math.max(1, next) : next);
  }

  /** Steht eine Beförderung an? Wird an Kontrollpunkten geprüft. */
  get promotionPending(): boolean {
    return canPromote(this.state);
  }

  /**
   * Befördert die Armee, sofern die Stärke reicht.
   *
   * Bewusst NICHT automatisch bei jeder Änderung: eine Beförderung mitten im
   * Vorbeifahren an einem Tor wäre nicht inszenierbar. Sie gehört an einen
   * Kontrollpunkt, wo sie einen Moment bekommt.
   *
   * @returns Anzahl der Stufen; 0, wenn nichts passiert ist.
   */
  tryPromote(): number {
    const result = promote(this.state);
    if (result.steps === 0) return 0;
    this.state = result.state;
    this.peakTier = Math.max(this.peakTier, this.state.tierIndex);
    this.bus.emit('army:promoted', {
      fromTierIndex: result.fromTierIndex,
      toTierIndex: result.toTierIndex,
    });
    this.bus.emit('army:changed', this.state);
    return result.steps;
  }

  /** Direkter Schaden an der Armee — ab Phase 4 vom Kampfsystem genutzt. */
  damage(amount: number): void {
    this.setPower(this.state.combatPower - Math.max(0, amount));
  }

  private setPower(value: number): void {
    const clamped = Math.max(0, value);
    if (clamped === this.state.combatPower) return;
    this.state = createArmyState(clamped, this.state.tierIndex);
    this.peakPower = Math.max(this.peakPower, clamped);
    this.bus.emit('army:changed', this.state);
  }
}
