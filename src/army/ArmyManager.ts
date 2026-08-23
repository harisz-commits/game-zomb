import type { ArmyState } from '../core/Types';
import type { EventBus } from '../core/EventBus';
import type { GateEffect } from '../config/gates';
import { getTier } from '../config/unitTiers';
import { ARMY } from '../config/gameBalance';
import { createArmyState, isDefeated } from './CombatPowerSystem';

/**
 * Hält den Armeezustand und ist die einzige Stelle, die ihn verändert.
 *
 * Jede Änderung geht durch `setPower`, damit die abgeleiteten Felder nie
 * veralten und `army:changed` verlässlich feuert.
 */
export class ArmyManager {
  private state: ArmyState;
  private peakPower: number;

  constructor(
    private readonly bus: EventBus,
    startPower: number = ARMY.startCombatPower,
  ) {
    this.state = createArmyState(startPower, 0);
    this.peakPower = this.state.combatPower;
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

  get tierName(): string {
    return getTier(this.state.tierIndex).name;
  }

  get peakCombatPower(): number {
    return this.peakPower;
  }

  get defeated(): boolean {
    return isDefeated(this.state, ARMY.defeatCombatPower);
  }

  reset(startPower: number = ARMY.startCombatPower): void {
    this.state = createArmyState(startPower, 0);
    this.peakPower = this.state.combatPower;
    this.bus.emit('army:changed', this.state);
  }

  /**
   * Wendet eine Gate-Entscheidung an.
   *
   * Additive Tore zählen in Einheiten des AKTUELLEN Tiers, nicht in
   * Basispunkten: „+10" heißt zehn Soldaten der Sorte, die gerade marschiert.
   * Ohne diese Kopplung wäre ein +10-Tor ab dem zweiten Tier bedeutungslos —
   * die Power wächst hundertfach pro Tier, ein fester Summand nicht mit.
   */
  applyGate(effect: GateEffect): void {
    const perUnit = getTier(this.state.tierIndex).powerPerUnit;
    const next =
      effect.kind === 'add'
        ? this.state.combatPower + effect.value * perUnit
        : this.state.combatPower * effect.value;
    // Multiplikatoren erzeugen Nachkommastellen; die Power bleibt ganzzahlig,
    // sonst zeigt das HUD Bruchteile von Soldaten an.
    this.setPower(Math.floor(next));
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
