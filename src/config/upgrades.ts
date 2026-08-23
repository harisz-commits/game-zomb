/**
 * Aufwertungen zur Auswahl — das Zwischenspiel am Kontrollpunkt.
 *
 * Statt still im Hintergrund stärker zu werden, hält die Runde kurz an und
 * legt drei Karten hin. Die Wahl ist der Reiz: drei Angebote, unterschiedlich
 * selten, und man bekommt genau eines.
 *
 * Wie bei den Toren wird der Beschriftungstext IMMER aus dem Zahlenwert
 * abgeleitet, nie danebengeschrieben — sonst verspricht die Karte
 * irgendwann etwas anderes, als sie tut.
 */

export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';

/**
 * Worauf eine Karte wirkt.
 *
 * `fireRate`, `damage` und `armor` fehlen bewusst: es gibt noch keine Gegner,
 * auf die sie wirken könnten. Eine Karte, die nichts tut, wäre eine Lüge.
 * Sie kommen mit dem Kampfsystem in Phase 4 dazu.
 */
export type UpgradeKind =
  | 'recruit'
  | 'gate-gain'
  | 'gate-shield'
  | 'speed'
  | 'steering'
  | 'promotion';

export const RARITIES: readonly Rarity[] = ['common', 'rare', 'epic', 'legendary'];

/**
 * Grundgewichte der Seltenheiten. Mit fortschreitender Runde verschiebt sich
 * das Verhältnis nach oben (siehe `rarityWeightsAt`) — späte Karten sollen
 * sich anders anfühlen als die ersten.
 */
export const RARITY_BASE_WEIGHTS: Readonly<Record<Rarity, number>> = {
  common: 62,
  rare: 26,
  epic: 9,
  legendary: 3,
};

/** Je Kontrollpunkt verschiebt sich dieser Anteil von „common" nach oben. */
const RARITY_DRIFT_PER_DRAFT = 0.055;

/** Seltenheitsgewichte am `draftIndex`-ten Kontrollpunkt (0-basiert). */
export function rarityWeightsAt(draftIndex: number): Record<Rarity, number> {
  const drift = Math.min(0.7, draftIndex * RARITY_DRIFT_PER_DRAFT);
  const moved = RARITY_BASE_WEIGHTS.common * drift;
  return {
    common: RARITY_BASE_WEIGHTS.common - moved,
    rare: RARITY_BASE_WEIGHTS.rare + moved * 0.5,
    epic: RARITY_BASE_WEIGHTS.epic + moved * 0.34,
    legendary: RARITY_BASE_WEIGHTS.legendary + moved * 0.16,
  };
}

export interface UpgradeKindSpec {
  kind: UpgradeKind;
  name: string;
  /** Relatives Gewicht bei der Auswahl, welche drei Arten angeboten werden. */
  weight: number;
  /** Stärke je Seltenheit, in der Einheit der jeweiligen Wirkung. */
  magnitude: Readonly<Record<Rarity, number>>;
  /** Baut den Beschreibungstext aus dem Zahlenwert. */
  describe: (magnitude: number) => string;
}

const percent = (value: number): string => `${Math.round(value * 100)}%`;

export const UPGRADE_KINDS: readonly UpgradeKindSpec[] = [
  {
    kind: 'recruit',
    name: 'Reinforcements',
    weight: 100,
    // In Einheiten des AKTUELLEN Tiers — sonst wäre die Karte später wertlos.
    magnitude: { common: 8, rare: 20, epic: 55, legendary: 140 },
    describe: (m) => `+${m} units, right now`,
  },
  {
    kind: 'gate-gain',
    name: 'Recruiting Drive',
    weight: 90,
    magnitude: { common: 0.1, rare: 0.25, epic: 0.5, legendary: 1 },
    describe: (m) => `Positive gates give ${percent(m)} more`,
  },
  {
    kind: 'gate-shield',
    name: 'Hardened Ranks',
    weight: 85,
    magnitude: { common: 0.15, rare: 0.3, epic: 0.55, legendary: 0.9 },
    describe: (m) => `Gate penalties hurt ${percent(m)} less`,
  },
  {
    kind: 'speed',
    name: 'Forced March',
    weight: 70,
    magnitude: { common: 0.06, rare: 0.12, epic: 0.2, legendary: 0.32 },
    describe: (m) => `${percent(m)} faster advance`,
  },
  {
    kind: 'steering',
    name: 'Drill Training',
    weight: 60,
    magnitude: { common: 0.12, rare: 0.24, epic: 0.4, legendary: 0.65 },
    describe: (m) => `${percent(m)} sharper steering`,
  },
  {
    kind: 'promotion',
    name: 'Field Commission',
    weight: 55,
    magnitude: { common: 0.08, rare: 0.16, epic: 0.28, legendary: 0.45 },
    describe: (m) => `Promote ${percent(m)} sooner`,
  },
];

/**
 * Obergrenzen. Ohne sie stapeln sich vier legendäre Schilde zu völliger
 * Unverwundbarkeit und die Torwahl verliert ihren Sinn.
 */
export const MODIFIER_CAPS = {
  gateShield: 0.85,
  promotionDiscount: 0.6,
  speed: 1.6,
  steering: 2.5,
} as const;

export const DRAFT = {
  /** Wie viele Karten zur Auswahl liegen. */
  cardCount: 3,
  /** Nur an jedem n-ten Kontrollpunkt — sonst reißt es die Fahrt zu oft auf. */
  everySectors: 2,
} as const;
