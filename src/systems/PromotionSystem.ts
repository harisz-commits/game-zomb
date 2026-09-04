import { BALANCE } from '../config/BalanceConfig';
import { getSoldierTier } from '../data/soldierTiers';
import type { ModifierState, SoldierTier } from '../types/game';
import { clamp } from '../utils/MathUtils';

export interface PromotionResult {
  fromTier: SoldierTier;
  toTier: SoldierTier;
  fromCount: number;
  toCount: number;
  promotionIndex: number;
}

/**
 * Converts an army to the next tier while preserving total combat power.
 *
 *   effectivePower = count * oldTierPower
 *   newCount       = ceil(effectivePower / newTierPower)
 *
 * Ceil (not floor) makes sure a surplus never evaporates:
 * 145 SOLDIERS (power 1) -> ceil(145 / 2) = 73 VETERANS.
 *
 * Exported standalone so the unit tests can exercise the math directly.
 */
export function convertArmyCount(count: number, oldPower: number, newPower: number): number {
  if (count <= 0) return 0;
  const effectivePower = count * oldPower;
  return Math.max(1, Math.ceil(effectivePower / newPower));
}

/**
 * Owns the tier ladder and the promotion threshold.
 * Pure logic - no scene, no rendering, fully unit tested.
 */
export class PromotionSystem {
  private tierIndex = 0;
  private promotionCount = 0;

  get currentTierIndex(): number {
    return this.tierIndex;
  }

  get currentTier(): SoldierTier {
    return getSoldierTier(this.tierIndex);
  }

  get promotions(): number {
    return this.promotionCount;
  }

  /** Army size required for the next promotion, after COMMAND upgrades. */
  getThreshold(mods?: ModifierState): number {
    const delta = mods?.promotionThresholdDelta ?? 0;
    return Math.round(
      clamp(
        BALANCE.PROMOTION_THRESHOLD + delta,
        BALANCE.MIN_PROMOTION_THRESHOLD,
        BALANCE.PROMOTION_THRESHOLD * 2,
      ),
    );
  }

  isReady(armyCount: number, mods?: ModifierState): boolean {
    return armyCount >= this.getThreshold(mods);
  }

  /** Advances the tier and returns the converted army size. */
  promote(armyCount: number): PromotionResult {
    const fromTier = getSoldierTier(this.tierIndex);
    const toTier = getSoldierTier(this.tierIndex + 1);
    const toCount = convertArmyCount(armyCount, fromTier.power, toTier.power);

    this.tierIndex += 1;
    this.promotionCount += 1;

    return {
      fromTier,
      toTier,
      fromCount: armyCount,
      toCount,
      promotionIndex: this.promotionCount,
    };
  }

  reset(): void {
    this.tierIndex = 0;
    this.promotionCount = 0;
  }
}
