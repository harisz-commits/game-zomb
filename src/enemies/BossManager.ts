import type { BossPhaseSpec, BossSpec } from '../config/bosses';
import { BOSS_RULES, bossForThreat } from '../config/bosses';
import { clamp } from '../util/math';

export interface BossState {
  spec: BossSpec;
  hp: number;
  maxHp: number;
  /** Weltposition; der Boss versperrt die Fahrbahn. */
  z: number;
  x: number;
  /** 0-basierter Index in `spec.phases`. */
  phase: number;
  /** Sekunden bis zum nächsten Angriff. */
  attackIn: number;
  armed: boolean;
  /** Sekunden seit dem Todesstoß; -1, solange er lebt. */
  dyingFor: number;
}

export interface BossTick {
  /** Kampfkraft, die dieser Schritt gekostet hat. */
  damageToArmy: number;
  /** Hat der Boss in diesem Schritt Zombies gerufen? */
  summoned: boolean;
  /** Ist er in diesem Schritt in eine neue Phase gewechselt? */
  phaseChanged: boolean;
  /** Ist er in diesem Schritt endgültig verschwunden? */
  finished: boolean;
}

const NO_TICK: BossTick = {
  damageToArmy: 0,
  summoned: false,
  phaseChanged: false,
  finished: false,
};

/**
 * Der Boss und seine Arena.
 *
 * Frei von Babylon — Phasenwechsel, Angriffstakt und Lebenspunkte werden ohne
 * Browser getestet.
 *
 * Wie eine Welle bekommt er seine Werte erst beim Betreten der Arena: Bis
 * dahin ist nur bekannt, WELCHER Boss wartet, nicht wie stark er ist. Sonst
 * stünde am Sektorende ein Gegner, der zur Armee von vor zwanzig Sekunden
 * passt.
 */
export class BossManager {
  private boss: BossState | null = null;

  get current(): BossState | null {
    return this.boss;
  }

  /** Kämpft die Armee gerade? Nur dann steht die Fahrt still. */
  get blocking(): boolean {
    return this.boss !== null && this.boss.dyingFor < 0;
  }

  /**
   * Läuft der Kampf bereits?
   *
   * Ein Boss wird am Sektorende aufgestellt, lange bevor die Armee ihn
   * erreicht. Bis dahin darf keine Lebensleiste zu sehen sein — sie stünde
   * zwanzig Sekunden lang auf null und sähe aus wie ein Fehler.
   */
  get engaged(): boolean {
    return this.boss !== null && this.boss.armed;
  }

  get hpRatio(): number {
    if (!this.boss || this.boss.maxHp <= 0) return 0;
    return clamp(this.boss.hp / this.boss.maxHp, 0, 1);
  }

  reset(): void {
    this.boss = null;
  }

  /** Stellt den Boss für einen kommenden Sektor auf. */
  place(z: number, threat: number): void {
    if (this.boss) return;
    this.boss = {
      spec: bossForThreat(threat),
      hp: 0,
      maxHp: 0,
      z,
      x: 0,
      phase: 0,
      attackIn: BOSS_RULES.openingDelay,
      armed: false,
      dyingFor: -1,
    };
  }

  /** Weltposition, an der die Armee stehen bleibt. */
  get arenaZ(): number {
    return this.boss ? this.boss.z - BOSS_RULES.arenaDistance : Number.POSITIVE_INFINITY;
  }

  update(dt: number, armyZ: number, armyPower: number): BossTick {
    const boss = this.boss;
    if (!boss) return NO_TICK;

    if (boss.dyingFor >= 0) {
      boss.dyingFor += dt;
      if (boss.dyingFor >= BOSS_RULES.deathSeconds) {
        this.boss = null;
        return { ...NO_TICK, finished: true };
      }
      return NO_TICK;
    }

    // Erst scharf machen, wenn die Armee in der Arena steht.
    if (!boss.armed) {
      if (armyZ < this.arenaZ - 1) return NO_TICK;
      boss.armed = true;
      boss.hp = Math.max(1, armyPower * boss.spec.hpShare);
      boss.maxHp = boss.hp;
    }

    const previousPhase = boss.phase;
    boss.phase = phaseIndexFor(boss);
    const phaseChanged = boss.phase !== previousPhase;
    // Ein Phasenwechsel unterbricht den laufenden Takt: der neue Abschnitt
    // soll sofort spürbar sein, nicht erst nach dem alten Intervall.
    if (phaseChanged) boss.attackIn = Math.min(boss.attackIn, 0.6);

    const phase = boss.spec.phases[boss.phase]!;
    boss.attackIn -= dt;
    if (boss.attackIn > 0) return { ...NO_TICK, phaseChanged };

    boss.attackIn = phase.attackInterval;
    return {
      damageToArmy: armyPower * phase.attackFraction,
      summoned: phase.summons,
      phaseChanged,
      finished: false,
    };
  }

  /** @returns true, wenn dieser Treffer den Boss erledigt hat. */
  damage(amount: number): boolean {
    const boss = this.boss;
    if (!boss || !boss.armed || boss.dyingFor >= 0) return false;
    boss.hp -= amount;
    if (boss.hp > 0) return false;
    boss.hp = 0;
    boss.dyingFor = 0;
    return true;
  }
}

function phaseIndexFor(boss: BossState): number {
  const ratio = boss.maxHp > 0 ? boss.hp / boss.maxHp : 0;
  for (let i = 0; i < boss.spec.phases.length; i += 1) {
    const phase: BossPhaseSpec = boss.spec.phases[i]!;
    if (ratio > phase.fromHpRatio) return i;
  }
  return boss.spec.phases.length - 1;
}

/** Anteil [0,1], zu dem ein sterbender Boss schon zusammengesackt ist. */
export function bossDeathProgress(boss: BossState): number {
  if (boss.dyingFor < 0) return 0;
  return clamp(boss.dyingFor / BOSS_RULES.deathSeconds, 0, 1);
}
