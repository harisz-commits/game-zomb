import type { SaveData } from '../save/SaveSchema';
import type { Currency, MetaUpgradeId, MetaUpgradeSpec } from '../config/metaUpgrades';
import { META_UPGRADES, metaUpgrade, metaUpgradeCost } from '../config/metaUpgrades';
import type { RunModifiers } from '../run/RunModifiers';
import { ARMY } from '../config/gameBalance';
import { getTier } from '../config/unitTiers';

/**
 * Die Brücke zwischen Spielstand und laufender Runde.
 *
 * Gekaufte Aufwertungen sind im Spielstand nur Zahlen. Hier werden sie zu
 * Wirkung — und zwar in dieselben `RunModifiers`, die auch die Karten am
 * Kontrollpunkt bedienen. Das Kampfsystem muss deshalb nicht wissen, woher
 * ein Bonus stammt.
 */

export function upgradeLevel(save: SaveData, id: MetaUpgradeId): number {
  const level = save.upgrades[id] ?? 0;
  return Math.min(level, metaUpgrade(id).maxLevel);
}

/** Gesamtwirkung einer Aufwertung beim aktuellen Stand. */
export function upgradeTotal(save: SaveData, id: MetaUpgradeId): number {
  return upgradeLevel(save, id) * metaUpgrade(id).perLevel;
}

export function balanceOf(save: SaveData, currency: Currency): number {
  return currency === 'coins' ? save.meta.coins : save.meta.techParts;
}

export interface PurchaseOffer {
  spec: MetaUpgradeSpec;
  level: number;
  maxed: boolean;
  cost: number;
  affordable: boolean;
  /** Beschreibung des Zustands NACH dem Kauf. */
  nextDescription: string;
  currentDescription: string;
}

export function offersFor(save: SaveData): PurchaseOffer[] {
  return META_UPGRADES.map((spec) => {
    const level = upgradeLevel(save, spec.id);
    const maxed = level >= spec.maxLevel;
    const cost = metaUpgradeCost(spec, level);
    return {
      spec,
      level,
      maxed,
      cost,
      affordable: !maxed && balanceOf(save, spec.currency) >= cost,
      currentDescription: spec.describe(level * spec.perLevel),
      nextDescription: spec.describe((level + 1) * spec.perLevel),
    };
  });
}

/**
 * Kauft eine Stufe, wenn sie bezahlbar ist.
 *
 * Gibt zurück, ob gekauft wurde — der Aufrufer entscheidet über Speichern
 * und Rückmeldung. Ein fehlgeschlagener Kauf verändert nichts.
 */
export function buyUpgrade(save: SaveData, id: MetaUpgradeId): boolean {
  const spec = metaUpgrade(id);
  const level = upgradeLevel(save, id);
  if (level >= spec.maxLevel) return false;

  const cost = metaUpgradeCost(spec, level);
  if (balanceOf(save, spec.currency) < cost) return false;

  if (spec.currency === 'coins') save.meta.coins -= cost;
  else save.meta.techParts -= cost;
  save.upgrades[id] = level + 1;
  return true;
}

/** Startstärke einer Runde in Basispunkten, inklusive Aufwertungen. */
export function startingCombatPower(save: SaveData): number {
  const extraUnits = upgradeTotal(save, 'start-army');
  // In Einheiten des Starttiers gerechnet, damit die Aufwertung dieselbe
  // Bedeutung behält, falls sich das Starttier je ändert.
  return ARMY.startCombatPower + extraUnits * getTier(0).powerPerUnit;
}

/**
 * Trägt die dauerhaften Aufwertungen in die Modifikatoren einer Runde ein.
 *
 * Muss VOR den Karten laufen: Beide addieren auf dieselben Felder, und die
 * Obergrenzen sollen den Gesamtwert deckeln, nicht die Reihenfolge.
 */
export function applyMetaUpgrades(save: SaveData, modifiers: RunModifiers): void {
  modifiers.damage += upgradeTotal(save, 'firepower');
  modifiers.fireRate += upgradeTotal(save, 'fire-rate');
  modifiers.armor += upgradeTotal(save, 'armor');
  modifiers.gateGain += upgradeTotal(save, 'gate-bonus');
  modifiers.promotionDiscount += upgradeTotal(save, 'veterancy');
}
