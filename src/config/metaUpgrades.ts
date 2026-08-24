/**
 * Dauerhafte Aufwertungen zwischen den Runden.
 *
 * Abgegrenzt von den Karten am Kontrollpunkt (`config/upgrades.ts`): Jene
 * gelten für eine Runde und werden gezogen, diese gelten für immer und werden
 * gekauft. Beide greifen auf dieselben `RunModifiers` zu — der Unterschied
 * liegt allein in Herkunft und Lebensdauer.
 *
 * Jede Stufe ist klein. Der Reiz liegt darin, dass es viele gibt und die
 * Kosten steigen, nicht darin, dass eine einzelne die Runde entscheidet.
 */

export type Currency = 'coins' | 'techParts';

export type MetaUpgradeId =
  | 'start-army'
  | 'firepower'
  | 'fire-rate'
  | 'armor'
  | 'gate-bonus'
  | 'veterancy'
  | 'salvage';

export interface MetaUpgradeSpec {
  id: MetaUpgradeId;
  name: string;
  currency: Currency;
  /** Wie oft die Aufwertung gekauft werden kann. */
  maxLevel: number;
  /** Kosten der ersten Stufe; danach wächst es geometrisch. */
  baseCost: number;
  costGrowth: number;
  /** Zuwachs je Stufe, in der Einheit der jeweiligen Wirkung. */
  perLevel: number;
  describe: (total: number) => string;
}

const percent = (value: number): string => `${Math.round(value * 100)}%`;

export const META_UPGRADES: readonly MetaUpgradeSpec[] = [
  {
    id: 'start-army',
    name: 'Standing Army',
    currency: 'coins',
    maxLevel: 20,
    baseCost: 90,
    costGrowth: 1.4,
    // In Einheiten des Starttiers, nicht in Basispunkten.
    perLevel: 4,
    describe: (total) => `Start with +${total} soldiers`,
  },
  {
    id: 'firepower',
    name: 'Base Firepower',
    currency: 'coins',
    maxLevel: 15,
    baseCost: 120,
    costGrowth: 1.45,
    perLevel: 0.06,
    describe: (total) => `+${percent(total)} firepower`,
  },
  {
    id: 'fire-rate',
    name: 'Trigger Discipline',
    currency: 'coins',
    maxLevel: 15,
    baseCost: 120,
    costGrowth: 1.45,
    perLevel: 0.05,
    describe: (total) => `+${percent(total)} fire rate`,
  },
  {
    id: 'armor',
    name: 'Field Armor',
    currency: 'coins',
    maxLevel: 12,
    baseCost: 150,
    costGrowth: 1.5,
    perLevel: 0.035,
    describe: (total) => `Take ${percent(total)} less damage`,
  },
  {
    id: 'gate-bonus',
    name: 'Recruiter Network',
    currency: 'coins',
    maxLevel: 12,
    baseCost: 160,
    costGrowth: 1.5,
    perLevel: 0.05,
    describe: (total) => `Gates give +${percent(total)}`,
  },
  {
    id: 'veterancy',
    name: 'Veterancy',
    currency: 'techParts',
    maxLevel: 8,
    baseCost: 2,
    costGrowth: 1.6,
    perLevel: 0.04,
    describe: (total) => `Promote ${percent(total)} sooner`,
  },
  {
    id: 'salvage',
    name: 'Salvage Crew',
    currency: 'techParts',
    maxLevel: 8,
    baseCost: 3,
    costGrowth: 1.7,
    perLevel: 0.12,
    describe: (total) => `+${percent(total)} coins earned`,
  },
];

export function metaUpgrade(id: MetaUpgradeId): MetaUpgradeSpec {
  const found = META_UPGRADES.find((entry) => entry.id === id);
  if (!found) throw new Error(`Unknown meta upgrade: ${id}`);
  return found;
}

/**
 * Kosten der nächsten Stufe. `level` ist die BEREITS gekaufte Stufe, der
 * Preis gilt also für den Sprung auf `level + 1`.
 */
export function metaUpgradeCost(spec: MetaUpgradeSpec, level: number): number {
  const raw = spec.baseCost * Math.pow(spec.costGrowth, level);
  // Aufgerundet auf glatte Werte — krumme Preise lesen sich wie ein Fehler.
  return spec.currency === 'coins' ? Math.round(raw / 5) * 5 : Math.ceil(raw);
}

/** Freischaltbedingungen. */
export const UNLOCKS = {
  /** Der Endlosmodus öffnet sich nach dem ersten gewonnenen Feldzug. */
  endless: 'endless',
} as const;
