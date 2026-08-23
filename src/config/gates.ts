/**
 * Gates — der Motor des Wachstumsgefühls.
 *
 * Eine Gate-Passage muss eine ECHTE Entscheidung sein. Deshalb werden immer
 * zwei ungleiche Seiten gepaart: die stärkere Seite kostet Risiko oder liegt
 * ungünstig, die schwächere ist sicher. Zwei gleich gute Seiten wären nur
 * eine Formalität, zwei schlechte nur eine Strafe.
 */

export type GateEffectKind = 'add' | 'multiply';

/** Farbliche Lesart auf einen Blick — Grün gut, Rot schlecht. */
export type GateTone = 'good' | 'great' | 'bad';

export interface GateEffect {
  kind: GateEffectKind;
  /** Bei 'add' ein Summand in Basispunkten, bei 'multiply' ein Faktor. */
  value: number;
  label: string;
  tone: GateTone;
  /** Relatives Gewicht in der Zufallsauswahl. */
  weight: number;
  /** Grober Wert der Seite — nur zum Paaren, nicht für die Simulation. */
  appeal: number;
}

export const POSITIVE_GATES: readonly GateEffect[] = [
  { kind: 'add', value: 5, label: '+5', tone: 'good', weight: 100, appeal: 1 },
  { kind: 'add', value: 10, label: '+10', tone: 'good', weight: 100, appeal: 2 },
  { kind: 'add', value: 20, label: '+20', tone: 'good', weight: 70, appeal: 3 },
  { kind: 'add', value: 35, label: '+35', tone: 'good', weight: 40, appeal: 4 },
  { kind: 'multiply', value: 2, label: '×2', tone: 'great', weight: 45, appeal: 6 },
  { kind: 'multiply', value: 3, label: '×3', tone: 'great', weight: 18, appeal: 8 },
];

/**
 * Strafen sind ausnahmslos PROPORTIONAL, nie fest.
 *
 * Ein fester Abzug passt nicht zu einer Kurve, die sich alle paar Tore
 * verdoppelt: „−20" beendet bei 13 Soldaten die Runde und ist bei 10.000
 * nicht mehr messbar. Ein Faktor kostet dagegen in jeder Spielphase gleich
 * viel — er bleibt spürbar, ohne je aus dem Nichts zu töten.
 */
export const NEGATIVE_GATES: readonly GateEffect[] = [
  { kind: 'multiply', value: 0.85, label: '−15%', tone: 'bad', weight: 100, appeal: -2 },
  { kind: 'multiply', value: 0.7, label: '−30%', tone: 'bad', weight: 55, appeal: -4 },
  { kind: 'multiply', value: 0.5, label: '÷2', tone: 'bad', weight: 22, appeal: -6 },
];

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
   * Anteil der Gates, bei denen beide Seiten positiv sind. Nur Strafen auf
   * einer Seite würde als Bestrafung statt als Wahl gelesen.
   */
  bothPositiveChance: 0.68,
  /** Sichtbare Breite eines Torflügels in Metern. */
  panelWidth: 3.9,
  panelHeight: 2.6,
} as const;

export const GATE_TONE_COLORS: Readonly<Record<GateTone, [number, number, number]>> = {
  good: [0.24, 0.72, 0.42],
  great: [0.28, 0.6, 1],
  bad: [0.82, 0.28, 0.24],
};
