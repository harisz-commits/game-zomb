import type { Rarity, UpgradeKind, UpgradeKindSpec } from '../config/upgrades';
import { DRAFT, RARITIES, UPGRADE_KINDS, rarityWeightsAt } from '../config/upgrades';
import type { Random } from '../util/Random';

export interface UpgradeCard {
  kind: UpgradeKind;
  name: string;
  rarity: Rarity;
  magnitude: number;
  description: string;
}

/**
 * Zieht die Karten für ein Zwischenspiel.
 *
 * Drei VERSCHIEDENE Arten, jede mit eigener Seltenheit. Dreimal dieselbe
 * Wirkung in drei Stufen wäre keine Wahl, sondern eine Preisliste.
 *
 * Gezogen wird aus dem Run-Seed, damit eine Runde reproduzierbar bleibt
 * (PLAN.md R7).
 */
export function drawUpgradeCards(
  rng: Random,
  draftIndex: number,
  count: number = DRAFT.cardCount,
): UpgradeCard[] {
  const weights = rarityWeightsAt(draftIndex);
  const pool = [...UPGRADE_KINDS];
  const cards: UpgradeCard[] = [];

  const wanted = Math.min(count, pool.length);
  for (let i = 0; i < wanted; i += 1) {
    const spec = rng.weighted(pool, (entry) => entry.weight);
    pool.splice(pool.indexOf(spec), 1);
    cards.push(makeCard(spec, rng.weighted(RARITIES, (rarity) => weights[rarity])));
  }
  return cards;
}

function makeCard(spec: UpgradeKindSpec, rarity: Rarity): UpgradeCard {
  const magnitude = spec.magnitude[rarity];
  return {
    kind: spec.kind,
    name: spec.name,
    rarity,
    magnitude,
    // Der Text kommt aus dem Wert, nie daneben geschrieben.
    description: spec.describe(magnitude),
  };
}
