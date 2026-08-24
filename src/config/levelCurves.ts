/**
 * Wachstums- und Schwierigkeitskurven. Bewusst als Funktionen ueber reinen
 * Parametern, damit Balancing nachvollziehbar bleibt.
 */

export const THREAT = {
  /** Gefahrenstufe zu Beginn einer Runde. */
  base: 0,
  /** Zuwachs pro Sektor. */
  perSector: 1,
  /** Ab hier waechst die Gefahr exponentiell statt linear. */
  exponentialFrom: 8,
  exponentialFactor: 1.12,
} as const;

/**
 * Der Endlosmodus.
 *
 * Eine endliche Runde endet nach fuenf bis sechs Sektoren und erreicht den
 * exponentiellen Teil der Kurve nie. Der Endlosmodus lebt genau davon: Er
 * muss irgendwann toeten, sonst ist er kein Modus, sondern ein Bildschirmschoner.
 *
 * Die ersten Sektoren laufen bewusst milder als in einer regulaeren Runde —
 * wer hier einsteigt, hat den Feldzug bereits gewonnen und soll nicht sofort
 * an derselben Wand stehen, sondern erst weit spaeter.
 */
export const ENDLESS = {
  /** Faktor auf die Gefahrenstufe; unter 1 ist der Einstieg sanfter. */
  threatScale: 0.85,
  /** Zusaetzlicher Zuwachs pro Sektor, oben auf die Grundkurve. */
  extraPerSector: 0.6,
  /** Alle so vielen Sektoren wird eine neue Gefahrenstufe ausgerufen. */
  milestoneEvery: 4,
} as const;

/**
 * Gefahrenstufe im Endlosmodus.
 *
 * Steigt schneller als die Grundkurve, startet aber flacher. Der Schnittpunkt
 * liegt bei rund sechs Sektoren — also genau dort, wo eine regulaere Runde
 * endet.
 */
export function endlessThreatForSector(sectorIndex: number): number {
  const base = threatLevelForSector(sectorIndex) * ENDLESS.threatScale;
  return base + sectorIndex * ENDLESS.extraPerSector;
}

/** Threat Level nach n abgeschlossenen Sektoren im Endlosmodus. */
export function threatLevelForSector(sectorIndex: number): number {
  const linear = THREAT.base + sectorIndex * THREAT.perSector;
  if (sectorIndex <= THREAT.exponentialFrom) return linear;
  const extra = sectorIndex - THREAT.exponentialFrom;
  return linear * Math.pow(THREAT.exponentialFactor, extra);
}

export const ENEMY_SCALING = {
  /** HP-Faktor pro Threat Level. */
  hpPerThreat: 1.18,
  /** Schadensfaktor pro Threat Level. */
  damagePerThreat: 1.09,
  /** Anzahl-Faktor pro Threat Level (gedeckelt durch die Display Caps). */
  countPerThreat: 1.07,
} as const;

export const UPGRADE_COST = {
  base: 100,
  growth: 1.45,
} as const;

/** Kosten fuer den Sprung von `level` auf `level + 1`. */
export function upgradeCost(level: number): number {
  return Math.round(UPGRADE_COST.base * Math.pow(UPGRADE_COST.growth, level));
}
