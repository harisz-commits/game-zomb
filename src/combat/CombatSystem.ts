import type { Enemy, EnemyManager } from '../enemies/EnemyManager';
import { COMBAT } from '../config/combat';
import { getTier } from '../config/unitTiers';

export interface CombatInput {
  dt: number;
  combatPower: number;
  tierIndex: number;
  armyX: number;
  armyZ: number;
  armyHalfWidth: number;
  /** Faktoren aus gewählten Karten. */
  fireRate: number;
  damage: number;
  /** Anteil [0,1), um den eingehender Schaden sinkt. */
  armor: number;
}

/** Schaden, der statt an die Horde an den Boss geht. */
export interface BossTarget {
  /** Nimmt Schaden entgegen; liefert true, wenn er dadurch stirbt. */
  damage: (amount: number) => boolean;
}

export interface CombatOutcome {
  /** Kampfkraft, die die Armee in diesem Schritt verloren hat. */
  powerLost: number;
  kills: number;
  /** Zahl der feuernden Ziele — treibt das Mündungsfeuer. */
  engaged: number;
  /** Hat dieser Schritt den Boss erledigt? */
  bossKilled: boolean;
}

/**
 * Der Schlagabtausch, aggregiert statt pro Kugel.
 *
 * Die Armee hat EINE Zahl, die gleichzeitig Feuerkraft und Lebenspunkte ist.
 * Das ist kein Kompromiss, sondern der Kern des Genres: Eine größere Truppe
 * schießt härter und hält mehr aus, und der Spieler versteht beides an
 * derselben Zahl.
 *
 * Zwei Richtungen pro Schritt:
 *  - Die Armee verteilt ihren Schaden auf die nächsten Ziele in Reichweite.
 *  - Jeder Zombie, der die Truppe erreicht, frisst Kampfkraft.
 */
export function resolveCombat(
  input: CombatInput,
  enemies: EnemyManager,
  boss?: BossTarget | null,
): CombatOutcome {
  const outcome: CombatOutcome = { powerLost: 0, kills: 0, engaged: 0, bossKilled: false };
  if (input.dt <= 0 || input.combatPower <= 0) return outcome;

  const tier = getTier(input.tierIndex);
  const dps =
    input.combatPower *
    COMBAT.dpsPerPower *
    tier.damageMultiplier *
    tier.fireRateMultiplier *
    input.damage *
    input.fireRate;

  const targets = enemies.targets(input.armyZ, COMBAT.maxTargets);
  outcome.engaged = targets.length;
  const step = dps * input.dt;

  if (boss) {
    // Im Bosskampf teilt sich das Feuer: Die Gerufenen dürfen nicht
    // ungestört durchlaufen, aber der Boss bleibt das Hauptziel — sonst
    // hielte ihn ein Dauerstrom von Minions unsterblich.
    const toHorde = targets.length > 0 ? step * 0.35 : 0;
    if (toHorde > 0) outcome.kills += spreadDamage(targets, toHorde, enemies);
    outcome.bossKilled = boss.damage(step - toHorde);
  } else if (targets.length > 0) {
    outcome.kills += spreadDamage(targets, step, enemies);
  }

  const biting = enemies.contacting(input.armyX, input.armyZ, input.armyHalfWidth);
  if (biting.length > 0) {
    const mitigation = 1 - Math.min(0.9, Math.max(0, input.armor));
    let incoming = 0;
    for (const enemy of biting) incoming += enemy.contactDps;
    outcome.powerLost = incoming * mitigation * input.dt;
  }

  return outcome;
}

/**
 * Verteilt den Schaden eines Schritts über die Ziele.
 *
 * Gleichmäßig statt fokussiert, damit sich eine sichtbare Front durch die
 * Horde frisst, statt einen Zombie nach dem anderen umfallen zu lassen.
 *
 * Entscheidend ist der Rest: Wer mehr abbekommt, als er aushält, verschluckt
 * den Überschuss nicht — er wandert in der nächsten Runde an die
 * Überlebenden. Ohne das versickerte bei einer großen Armee der Löwenanteil
 * des Feuers in bereits sterbenden Zombies, die Horde staute sich auf, und
 * die Feuerkraft fühlte sich schwächer an, als sie ist.
 */
function spreadDamage(targets: Enemy[], budget: number, enemies: EnemyManager): number {
  let remaining = budget;
  let kills = 0;
  let survivors = targets;

  // Drei Durchgänge reichen: jeder tötet die Schwächsten und gibt deren
  // Überschuss weiter. Eine exakte Auflösung wäre eine Sortierung pro Bild,
  // ohne dass man den Unterschied sähe.
  for (let pass = 0; pass < 3 && remaining > 0 && survivors.length > 0; pass += 1) {
    const share = remaining / survivors.length;
    const stillStanding: Enemy[] = [];
    let spent = 0;
    for (const enemy of survivors) {
      const dealt = Math.min(share, enemy.hp);
      enemy.hp -= dealt;
      spent += dealt;
      if (enemy.hp <= 0) {
        enemies.kill(enemy);
        kills += 1;
      } else {
        stillStanding.push(enemy);
      }
    }
    remaining -= spent;
    survivors = stillStanding;
  }
  return kills;
}

/** Nur für Tests und Debug: Rest-Lebenspunkte der Horde. */
export function remainingHp(enemies: readonly Enemy[]): number {
  let total = 0;
  for (const enemy of enemies) if (enemy.dyingFor < 0) total += Math.max(0, enemy.hp);
  return total;
}
