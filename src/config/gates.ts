/**
 * Gates — der Motor des Wachstumsgefühls.
 *
 * Zwei bewusste Entwurfsentscheidungen machen die Torwahl zu einer echten
 * Entscheidung statt zu einer Reflexbewegung:
 *
 * 1. **Alle Tore sehen gleich aus.** Keine Ampelfarben. Verriete die Farbe,
 *    ob eine Seite gut ist, müsste niemand mehr die Zahl lesen — die
 *    Entscheidung wäre gratis.
 * 2. **Derselbe Effekt trägt unterschiedliche Schreibweisen.** „×0.5" und
 *    „−50%" sind exakt dasselbe. Wer schnell wählen will, muss beide
 *    Notationen im Kopf haben; „×0.05 oder −50%, was ist schlimmer?" ist
 *    genau die Frage, die eine Sekunde kostet.
 */

export type GateEffectKind = 'add' | 'multiply';

/**
 * Wie ein Effekt beschriftet wird. Die Beschriftung wird IMMER aus dem Wert
 * abgeleitet, nie von Hand geschrieben — sonst driften Anzeige und Wirkung
 * irgendwann auseinander und das Spiel lügt den Spieler an.
 */
export type GateNotation = 'factor' | 'percent' | 'flat';

export interface GateEffect {
  kind: GateEffectKind;
  /** Bei 'add' ein Summand in Einheiten des aktuellen Tiers, sonst ein Faktor. */
  value: number;
  notation: GateNotation;
  /** Relatives Gewicht in der Zufallsauswahl. */
  weight: number;
}

/** Erzeugt die Aufschrift eines Tors aus seiner tatsächlichen Wirkung. */
export function gateLabel(effect: GateEffect): string {
  if (effect.kind === 'add') {
    return effect.value >= 0 ? `+${effect.value}` : `−${Math.abs(effect.value)}`;
  }
  if (effect.notation === 'factor') {
    return `×${effect.value}`;
  }
  const percent = Math.round((effect.value - 1) * 100);
  return percent >= 0 ? `+${percent}%` : `−${Math.abs(percent)}%`;
}

/**
 * Referenzstärke, an der beim Erzeugen abgeschätzt wird, wie stark ein
 * additives Tor wirkt. Nur zum Paaren zweier Seiten — die Simulation rechnet
 * immer mit der echten Armeestärke.
 */
const NOMINAL_POWER = 45;

/** Grober Wirkungsfaktor eines Effekts, ausschließlich für die Paarung. */
export function nominalFactor(effect: GateEffect): number {
  if (effect.kind === 'multiply') return effect.value;
  return Math.max(0, (NOMINAL_POWER + effect.value) / NOMINAL_POWER);
}

/**
 * Dieselbe Wirkung erscheint absichtlich in beiden Schreibweisen — mal als
 * Faktor, mal als Prozentangabe.
 */
export const POSITIVE_GATES: readonly GateEffect[] = [
  { kind: 'add', value: 10, notation: 'flat', weight: 110 },
  { kind: 'add', value: 25, notation: 'flat', weight: 80 },
  { kind: 'add', value: 50, notation: 'flat', weight: 45 },
  { kind: 'multiply', value: 1.5, notation: 'factor', weight: 30 },
  { kind: 'multiply', value: 1.5, notation: 'percent', weight: 30 },
  { kind: 'multiply', value: 2, notation: 'factor', weight: 15 },
  { kind: 'multiply', value: 2, notation: 'percent', weight: 15 },
  { kind: 'multiply', value: 3, notation: 'factor', weight: 4 },
  { kind: 'multiply', value: 3, notation: 'percent', weight: 4 },
];

/**
 * Strafen sind ausnahmslos PROPORTIONAL, nie fest.
 *
 * Ein fester Abzug passt nicht zu einer Kurve, die sich alle paar Tore
 * verdoppelt: „−20" beendet bei 13 Soldaten die Runde und ist bei 10.000
 * nicht mehr messbar. Ein Faktor kostet in jeder Spielphase gleich viel.
 */
export const NEGATIVE_GATES: readonly GateEffect[] = [
  { kind: 'multiply', value: 0.8, notation: 'factor', weight: 90 },
  { kind: 'multiply', value: 0.8, notation: 'percent', weight: 90 },
  { kind: 'multiply', value: 0.6, notation: 'factor', weight: 60 },
  { kind: 'multiply', value: 0.6, notation: 'percent', weight: 60 },
  { kind: 'multiply', value: 0.35, notation: 'factor', weight: 28 },
  { kind: 'multiply', value: 0.35, notation: 'percent', weight: 28 },
  { kind: 'multiply', value: 0.05, notation: 'factor', weight: 10 },
  { kind: 'multiply', value: 0.05, notation: 'percent', weight: 10 },
];

/**
 * Wie ein Torpaar zusammengesetzt wird.
 *
 * Die Falle-Variante (beide Seiten schlecht) ist der Grund, warum der Spieler
 * jede Aufschrift lesen muss: Es gibt keine sichere Seite, nur eine weniger
 * teure. Sie bleibt in der Minderheit, damit die Runde nicht zur Strafrunde
 * wird.
 */
export const GATE_PAIRING = {
  bothPositive: 0.42,
  mixed: 0.36,
  bothNegative: 0.22,
} as const;

export const GATE_LAYOUT = {
  /** Abstand zwischen zwei Gates in Metern. */
  spacingMeters: 46,
  /** Erstes Gate erst nach dieser Strecke — der Spieler soll erst ankommen. */
  firstGateMeters: 34,
  /** So weit im Voraus werden Gates erzeugt (muss > Sichtweite sein). */
  lookaheadMeters: 210,
  /** So weit hinter der Armee werden passierte Gates aufgeräumt. */
  cleanupMeters: 25,
  /**
   * Die ersten Tore einer Runde sind nie eine Falle. Wer in den ersten
   * Sekunden bestraft wird, ohne die Regeln zu kennen, hört auf.
   */
  safeGates: 3,
  /** Sichtbare Breite eines Torflügels in Metern. */
  panelWidth: 3.9,
  panelHeight: 2.6,
} as const;

/**
 * EINE Farbe für alle Tore. Siehe Kopf der Datei: die Farbe darf die Antwort
 * nicht verraten.
 *
 * Helle Beschilderung mit dunkler Schrift, bewusst unbunt: Blau, Grün, Gold
 * und Magenta sind bereits die Farben der Einheiten-Tiers. Ein blaues Tor
 * neben blauen Riflemen wäre keine neutrale Wahl, sondern nur schlecht
 * lesbar.
 */
export const GATE_COLOR: readonly [number, number, number] = [0.93, 0.94, 0.96];
export const GATE_TEXT_COLOR = '#141a22';
