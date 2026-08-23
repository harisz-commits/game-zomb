/**
 * Bosse.
 *
 * Ein Boss ist kein besonders zäher Zombie, sondern ein Bruch im Rhythmus:
 * Die Fahrt hält an, die Kamera hat ein Ziel, und die ganze angesammelte
 * Feuerkraft trifft auf eine einzige Lebensleiste. Genau deshalb bekommt er
 * eine Arena statt einfach mitzulaufen — sonst wäre er nur ein Brute mit
 * mehr Punkten.
 *
 * Wie bei den Wellen sind seine Werte ANTEILE der Armeestärke (Begründung in
 * `config/combat.ts`) und werden erst beim Betreten der Arena festgelegt.
 */

export interface BossPhaseSpec {
  /** Ab diesem Anteil verbleibender Lebenspunkte gilt die Phase. */
  fromHpRatio: number;
  /** Sekunden zwischen zwei Angriffen. */
  attackInterval: number;
  /** Schaden je Angriff als Anteil der Armeestärke. */
  attackFraction: number;
  /** Ruft dieser Angriff zusätzlich Zombies? */
  summons: boolean;
}

export interface BossSpec {
  id: string;
  name: string;
  /**
   * Lebenspunkte als Anteil der Armeestärke beim Betreten der Arena.
   *
   * Bestimmt die Länge des Kampfes: Rund ein Drittel der Feuerkraft geht an
   * den Boss, also dauert er etwa `hpShare / 0.3` Sekunden mal Kehrwert der
   * Tier-Boni. Bei sieben waren das zwanzig Sekunden — zu lang, die Armee
   * wurde in der Zeit aufgerieben.
   */
  hpShare: number;
  /** Ab dieser Gefahrenstufe kann dieser Boss erscheinen. */
  minThreat: number;
  phases: readonly BossPhaseSpec[];
  visual: { color: [number, number, number]; scale: number };
}

/**
 * Die Phasen eskalieren nach unten: je näher der Boss am Ende ist, desto
 * schneller schlägt er zu. Ein Boss, der beim letzten Zehntel genauso
 * harmlos ist wie beim ersten, hat keinen Schlussakkord.
 */
const STANDARD_PHASES: readonly BossPhaseSpec[] = [
  { fromHpRatio: 0.66, attackInterval: 2.8, attackFraction: 0.035, summons: false },
  { fromHpRatio: 0.33, attackInterval: 2.1, attackFraction: 0.05, summons: true },
  { fromHpRatio: 0, attackInterval: 1.5, attackFraction: 0.07, summons: true },
];

export const BOSSES: readonly BossSpec[] = [
  {
    id: 'behemoth',
    name: 'Zombie Behemoth',
    hpShare: 4,
    minThreat: 0,
    phases: STANDARD_PHASES,
    visual: { color: [0.55, 0.22, 0.24], scale: 4.6 },
  },
  {
    id: 'bio-tank',
    name: 'Bio Tank',
    hpShare: 5,
    minThreat: 4,
    phases: STANDARD_PHASES,
    visual: { color: [0.38, 0.6, 0.26], scale: 5.2 },
  },
  {
    id: 'armored-giant',
    name: 'Armored Giant',
    hpShare: 6.5,
    minThreat: 9,
    phases: STANDARD_PHASES,
    visual: { color: [0.46, 0.48, 0.56], scale: 5.8 },
  },
  {
    id: 'lab-horror',
    name: 'Lab Horror',
    hpShare: 8,
    minThreat: 15,
    phases: STANDARD_PHASES,
    visual: { color: [0.72, 0.3, 0.72], scale: 6.4 },
  },
];

export const BOSS_RULES = {
  /** Nach so vielen Sektoren wartet ein Boss. */
  everySectors: 3,
  /** In diesem Abstand vor dem Boss hält die Armee an (Meter). */
  arenaDistance: 21,
  /** Sekunden, die der Boss beim Sterben zusammensackt. */
  deathSeconds: 1.4,
  /** Erster Angriff erst nach dieser Zeit — ein Moment zum Begreifen. */
  openingDelay: 1.6,
  /** Zombies, die ein Ruf-Angriff herbeiholt. */
  summonCount: 7,
  /** Lebenspunkte der Gerufenen, als Anteil der Armeestärke insgesamt. */
  summonHpShare: 0.25,
  /**
   * Nahkampfschaden der Gerufenen insgesamt, als Anteil der Armeestärke.
   *
   * Sehr niedrig, und das musste gemessen werden: Bei 0,1 trugen sieben
   * Runner zehn Prozent der Armeestärke PRO SEKUNDE — mehr als eine ganze
   * reguläre Welle aus dreissig Zombies. Sie allein töteten jeden Lauf.
   * Gerufene sind Störfeuer, nicht die eigentliche Gefahr; die ist der Boss.
   */
  summonDamageShare: 0.03,
} as const;

export function bossForThreat(threat: number): BossSpec {
  const eligible = BOSSES.filter((boss) => boss.minThreat <= threat);
  // Immer den stärksten passenden — ein früherer Boss wäre ein Rückschritt.
  return eligible[eligible.length - 1] ?? BOSSES[0]!;
}
