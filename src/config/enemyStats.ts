/**
 * Gegner-Archetypen.
 *
 * Lebenspunkte und Schaden stehen hier als VERHÄLTNISSE, nicht als absolute
 * Zahlen: Eine Welle bekommt ihr Budget als Anteil der Armeestärke
 * (siehe `config/combat.ts`) und verteilt es nach diesen Faktoren. Ein Tank
 * ist damit immer „achtmal so zäh wie ein Walker" — unabhängig davon, ob die
 * Armee acht Soldaten hat oder acht Milliarden Punkte Kampfkraft.
 *
 * Geschwindigkeit ist dagegen absolut: Ein Runner ist schnell, und das darf
 * nicht davon abhängen, wie stark der Spieler gerade ist.
 */

export type EnemyArchetypeId = 'walker' | 'runner' | 'tank' | 'shielded' | 'brute';

export interface EnemyArchetype {
  id: EnemyArchetypeId;
  name: string;
  /** Zähigkeit relativ zum Walker. */
  hpFactor: number;
  /** Schaden im Nahkampf relativ zum Walker. */
  damageFactor: number;
  /** Meter pro Sekunde, absolut. */
  speed: number;
  /** Relative Spawn-Häufigkeit. */
  weight: number;
  /** Ab dieser Gefahrenstufe darf der Typ auftauchen. */
  minThreat: number;
  visual: { color: [number, number, number]; scale: number };
}

export const ENEMY_ARCHETYPES: readonly EnemyArchetype[] = [
  {
    id: 'walker',
    name: 'Walker',
    hpFactor: 1,
    damageFactor: 1,
    speed: 2.4,
    weight: 100,
    minThreat: 0,
    visual: { color: [0.42, 0.55, 0.32], scale: 1 },
  },
  {
    id: 'runner',
    name: 'Runner',
    hpFactor: 0.7,
    damageFactor: 1.4,
    speed: 6.2,
    weight: 52,
    minThreat: 1,
    visual: { color: [0.76, 0.66, 0.26], scale: 0.92 },
  },
  {
    id: 'tank',
    name: 'Tank Zombie',
    hpFactor: 8,
    damageFactor: 3,
    speed: 1.5,
    weight: 22,
    minThreat: 2,
    visual: { color: [0.33, 0.44, 0.3], scale: 1.5 },
  },
  {
    id: 'shielded',
    name: 'Shielded Mutant',
    hpFactor: 5,
    damageFactor: 2,
    speed: 2.6,
    weight: 16,
    minThreat: 4,
    visual: { color: [0.5, 0.52, 0.6], scale: 1.24 },
  },
  {
    id: 'brute',
    name: 'Brute',
    hpFactor: 18,
    damageFactor: 6,
    speed: 3.1,
    weight: 7,
    minThreat: 6,
    visual: { color: [0.62, 0.24, 0.24], scale: 1.95 },
  },
];

export function archetypesAtThreat(threat: number): EnemyArchetype[] {
  return ENEMY_ARCHETYPES.filter((entry) => entry.minThreat <= threat);
}

export function archetypeById(id: EnemyArchetypeId): EnemyArchetype {
  const found = ENEMY_ARCHETYPES.find((entry) => entry.id === id);
  if (!found) throw new Error(`Unknown enemy archetype: ${id}`);
  return found;
}
