import type { EnemyArchetypeId } from '../config/enemyStats';
import { COMBAT, WAVES } from '../config/combat';
import { clamp, moveTowards } from '../util/math';
import type { WaveSpawn } from './ZombieSpawner';

export interface Enemy {
  id: number;
  archetype: EnemyArchetypeId;
  x: number;
  z: number;
  /** Erst gesetzt, wenn der Zombie scharf gemacht wurde; vorher 0. */
  hp: number;
  maxHp: number;
  speed: number;
  /** Schaden pro Sekunde an der Kampfkraft, sobald er die Armee erreicht. */
  contactDps: number;
  /** Sekunden seit dem Tod; -1, solange er lebt. */
  dyingFor: number;
  /** Lebenspunkte als Anteil der Armeestärke, bis scharf gemacht. */
  hpShare: number;
  damageShare: number;
  armed: boolean;
}

/**
 * Ab dieser Entfernung bekommt ein Zombie seine echten Werte — etwas weiter
 * als die Feuerreichweite, damit er nie unbewaffnet beschossen wird.
 */
const ARM_RANGE = COMBAT.fireRange + 10;

/**
 * Hält die Zombies, bewegt sie und räumt sie weg.
 *
 * Frei von Babylon — die Hordenlogik ist der Teil, der stimmen muss, und
 * wird ohne Browser getestet. Der Renderer liest den Zustand nur.
 *
 * Bewusst KEINE Zustandsautomaten pro Zombie: Ein Zombie läuft auf die Armee
 * zu und beißt. Mehr braucht es nicht, und bei zweihundert gleichzeitig wäre
 * mehr auch nicht bezahlbar.
 */
export class EnemyManager {
  private enemies: Enemy[] = [];
  private nextId = 0;

  get all(): readonly Enemy[] {
    return this.enemies;
  }

  get aliveCount(): number {
    let count = 0;
    for (const enemy of this.enemies) if (enemy.dyingFor < 0) count += 1;
    return count;
  }

  reset(): void {
    this.enemies.length = 0;
    this.nextId = 0;
  }

  spawn(wave: WaveSpawn): void {
    for (const member of wave.members) {
      this.enemies.push({
        id: this.nextId++,
        archetype: member.archetype,
        x: member.x,
        z: member.z,
        hp: 0,
        maxHp: 0,
        speed: member.speed,
        contactDps: 0,
        dyingFor: -1,
        hpShare: member.hpShare,
        damageShare: member.damageShare,
        armed: false,
      });
    }
  }

  /**
   * Bewegt die Horde auf die Armee zu.
   *
   * Seitlich hält ein Zombie nur begrenzt schnell nach — sonst wäre Ausweichen
   * wirkungslos und die Steuerung im Kampf bedeutungslos.
   */
  update(dt: number, armyX: number, armyZ: number, armyPower: number): void {
    for (const enemy of this.enemies) {
      if (enemy.dyingFor >= 0) {
        enemy.dyingFor += dt;
        continue;
      }
      enemy.z -= enemy.speed * dt;
      enemy.x = moveTowards(enemy.x, armyX, COMBAT.homingSpeed * dt);
      if (!enemy.armed && enemy.z <= armyZ + ARM_RANGE) this.arm(enemy, armyPower);
    }
    this.cull(armyZ);
  }

  /**
   * Legt die echten Werte eines Zombies fest — erst kurz vor der Begegnung.
   *
   * Eine Welle entsteht bis zu zwanzig Sekunden im Voraus. Würde ihre Stärke
   * schon dann festgeschrieben, wäre sie beim Eintreffen veraltet: Die Armee
   * wächst in dieser Zeit durch Tore um ein Vielfaches, und die Welle träfe
   * wirkungslos ein. Sichtbar ist der Unterschied nicht — Lebenspunkte stehen
   * einem Zombie nicht an.
   */
  private arm(enemy: Enemy, armyPower: number): void {
    enemy.armed = true;
    enemy.hp = Math.max(1, armyPower * enemy.hpShare);
    enemy.maxHp = enemy.hp;
    enemy.contactDps = armyPower * enemy.damageShare;
  }

  /** Zombies, die die Armee erreicht haben. */
  contacting(armyX: number, armyZ: number, armyHalfWidth: number): Enemy[] {
    const reach = armyHalfWidth + COMBAT.contactRange;
    const hits: Enemy[] = [];
    for (const enemy of this.enemies) {
      if (enemy.dyingFor >= 0) continue;
      if (enemy.z > armyZ + COMBAT.contactRange) continue;
      if (Math.abs(enemy.x - armyX) > reach) continue;
      hits.push(enemy);
    }
    return hits;
  }

  /** Lebende Ziele in Feuerreichweite, die nächsten zuerst. */
  targets(armyZ: number, limit: number): Enemy[] {
    const inRange = this.enemies.filter(
      (enemy) =>
        enemy.dyingFor < 0 &&
        enemy.armed &&
        enemy.z >= armyZ - COMBAT.contactRange &&
        enemy.z <= armyZ + COMBAT.fireRange,
    );
    inRange.sort((a, b) => a.z - b.z);
    return inRange.slice(0, limit);
  }

  kill(enemy: Enemy): void {
    if (enemy.dyingFor >= 0) return;
    enemy.hp = 0;
    enemy.dyingFor = 0;
  }

  private cull(armyZ: number): void {
    const cutoff = armyZ - WAVES.cleanupMeters;
    this.enemies = this.enemies.filter(
      (enemy) =>
        enemy.z > cutoff && (enemy.dyingFor < 0 || enemy.dyingFor < COMBAT.deathFadeSeconds),
    );
  }
}

/** Anteil [0,1], zu dem ein sterbender Zombie schon zusammengesackt ist. */
export function deathProgress(enemy: Enemy): number {
  if (enemy.dyingFor < 0) return 0;
  return clamp(enemy.dyingFor / COMBAT.deathFadeSeconds, 0, 1);
}
