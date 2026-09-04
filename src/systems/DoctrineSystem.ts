import { BALANCE } from '../config/BalanceConfig';
import { DOCTRINE_DEFINITIONS } from '../data/doctrineDefinitions';
import type { DoctrineDefinition, UpgradeEffects, UpgradeFamily } from '../types/game';
import { UPGRADE_FAMILIES } from '../types/game';

export interface DoctrineUnlock {
  definition: DoctrineDefinition;
  level: number;
}

/**
 * Tracks how many cards of each family the run owns and derives doctrine
 * levels from it. Doctrines are never chosen by the player - they unlock
 * automatically at 3 and 6 cards of the same family.
 */
export class DoctrineSystem {
  private readonly counts: Record<UpgradeFamily, number> = {
    FIREPOWER: 0,
    BALLISTICS: 0,
    PRECISION: 0,
    EXPLOSIVES: 0,
    COMMAND: 0,
    DEFENSE: 0,
  };

  private readonly levels: Record<UpgradeFamily, number> = {
    FIREPOWER: 0,
    BALLISTICS: 0,
    PRECISION: 0,
    EXPLOSIVES: 0,
    COMMAND: 0,
    DEFENSE: 0,
  };

  /**
   * Registers a drafted card. Returns a freshly reached doctrine level, or
   * null if nothing changed.
   */
  registerCard(family: UpgradeFamily): DoctrineUnlock | null {
    this.counts[family] += 1;
    const count = this.counts[family];

    let newLevel = this.levels[family];
    if (count >= BALANCE.DOCTRINE_CARDS_LEVEL_2) newLevel = 2;
    else if (count >= BALANCE.DOCTRINE_CARDS_LEVEL_1) newLevel = 1;

    if (newLevel > this.levels[family]) {
      this.levels[family] = newLevel;
      return { definition: DOCTRINE_DEFINITIONS[family], level: newLevel };
    }
    return null;
  }

  getLevel(family: UpgradeFamily): number {
    return this.levels[family];
  }

  getCardCount(family: UpgradeFamily): number {
    return this.counts[family];
  }

  getLevels(): Record<UpgradeFamily, number> {
    return { ...this.levels };
  }

  /** All doctrine effects currently in play, in application order. */
  collectEffects(): UpgradeEffects[] {
    const effects: UpgradeEffects[] = [];
    for (const family of UPGRADE_FAMILIES) {
      const level = this.levels[family];
      if (level <= 0) continue;
      const def = DOCTRINE_DEFINITIONS[family];
      effects.push(def.level1);
      if (level >= 2) effects.push(def.level2);
    }
    return effects;
  }

  getActive(): DoctrineUnlock[] {
    const active: DoctrineUnlock[] = [];
    for (const family of UPGRADE_FAMILIES) {
      if (this.levels[family] > 0) {
        active.push({ definition: DOCTRINE_DEFINITIONS[family], level: this.levels[family] });
      }
    }
    return active;
  }

  reset(): void {
    for (const family of UPGRADE_FAMILIES) {
      this.counts[family] = 0;
      this.levels[family] = 0;
    }
  }
}
