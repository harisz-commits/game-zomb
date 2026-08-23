import { describe, expect, it } from 'vitest';
import { GateSystem } from '../src/run/GateSystem';
import { ArmyManager } from '../src/army/ArmyManager';
import { EnemyManager } from '../src/enemies/EnemyManager';
import { ZombieSpawner } from '../src/enemies/ZombieSpawner';
import { resolveCombat } from '../src/combat/CombatSystem';
import { BossManager } from '../src/enemies/BossManager';
import { BOSS_RULES } from '../src/config/bosses';
import { RunDirector } from '../src/run/RunDirector';
import { RunModifiers } from '../src/run/RunModifiers';
import { EventBus } from '../src/core/EventBus';
import { ARMY, DISPLAY_CAPS, MOVEMENT } from '../src/config/gameBalance';
import { threatLevelForSector } from '../src/config/levelCurves';
import { powerAfterEffect } from '../src/army/CombatPowerSystem';
import { getTier } from '../src/config/unitTiers';

const STEP = 1 / 60;

interface RunOutcome {
  power: number;
  kills: number;
  lost: number;
  died: boolean;
  peakAlive: number;
  bossesFought: number;
  bossesKilled: number;
  /** Anteil der Kampfkraft, den der erste Bosskampf gekostet hat. */
  firstBossCost: number;
}

/**
 * Fährt eine vollständige Runde: Tore, Wellen, Kampf, Beförderung.
 *
 * `smart` wählt an jedem Tor die tatsächlich bessere Seite, sonst wird
 * abwechselnd geraten — der Unterschied zwischen können und drücken.
 */
function playRun(seed: number, seconds: number, smart: boolean): RunOutcome {
  const mods = new RunModifiers();
  const army = new ArmyManager(new EventBus(), ARMY.startCombatPower, mods);
  // Derselbe Regisseur wie im Spiel: sonst misst der Test eine Sektorfolge,
  // die es nicht mehr gibt.
  const director = new RunDirector(seed, 'endless');
  const gates = new GateSystem(seed, director);
  const enemies = new EnemyManager();
  const spawner = new ZombieSpawner(seed ^ 0x51ed270b, director);
  const boss = new BossManager();

  let bossesFought = 0;
  let bossesKilled = 0;
  let lastBossSector = -1;
  let bossEntryPower = 0;
  let firstBossCost = 0;
  let distance = 0;
  let sector = 0;
  let kills = 0;
  let lost = 0;
  let peakAlive = 0;

  for (let t = 0; t < seconds; t += STEP) {
    distance += MOVEMENT.forwardSpeed * mods.speed * STEP;

    const upcoming = gates.active.find((gate) => !gate.resolved && gate.z - distance < 12);
    let x = 0;
    if (upcoming) {
      const perUnit = getTier(army.current.tierIndex).powerPerUnit;
      const leftBetter =
        powerAfterEffect(army.combatPower, upcoming.left, perUnit, mods) >=
        powerAfterEffect(army.combatPower, upcoming.right, perUnit, mods);
      x = smart
        ? leftBetter
          ? -3
          : 3
        : (seed + Math.floor(distance / 46)) % 2 === 0
          ? -3
          : 3;
    }
    gates.update(distance, x, (effect) => army.applyGate(effect));

    const threat = threatLevelForSector(sector);
    const plan = director.sector(sector);
    if (sector !== lastBossSector && plan.hasBoss) {
      lastBossSector = sector;
      boss.place(director.bossZ(sector), threat);
    }
    for (const wave of spawner.due(distance, threat)) enemies.spawn(wave);
    enemies.update(STEP, x, distance, army.combatPower);

    const wasEngaged = boss.engaged;
    const bossTick = boss.update(STEP, distance, army.combatPower);
    if (!wasEngaged && boss.engaged) {
      bossesFought += 1;
      bossEntryPower = army.combatPower;
    }
    if (bossTick.damageToArmy > 0) {
      const mitigated = bossTick.damageToArmy * (1 - Math.min(0.9, mods.armor));
      army.damage(mitigated);
      lost += mitigated;
    }
    if (bossTick.summoned) {
      const count = BOSS_RULES.summonCount;
      enemies.spawn({
        index: -1,
        z: boss.current!.z,
        threat: 0,
        members: Array.from({ length: count }, (_, i) => ({
          archetype: 'runner' as const,
          x: -4 + (8 * i) / Math.max(1, count - 1),
          z: boss.current!.z - 3,
          speed: 5.4,
          hpShare: BOSS_RULES.summonHpShare / count,
          damageShare: BOSS_RULES.summonDamageShare / count,
        })),
      });
    }

    const outcome = resolveCombat(
      {
        dt: STEP,
        combatPower: army.combatPower,
        tierIndex: army.current.tierIndex,
        armyX: x,
        armyZ: distance,
        armyHalfWidth: 2.2,
        fireRate: mods.fireRate,
        damage: mods.damage,
        armor: mods.armor,
      },
      enemies,
      boss.engaged && boss.blocking ? boss : null,
    );
    kills += outcome.kills;
    if (outcome.bossKilled) {
      bossesKilled += 1;
      if (bossesKilled === 1 && bossEntryPower > 0) {
        firstBossCost = 1 - army.combatPower / bossEntryPower;
      }
    }
    lost += outcome.powerLost;
    if (outcome.powerLost > 0) army.damage(outcome.powerLost);
    peakAlive = Math.max(peakAlive, enemies.aliveCount);
    // Die Arena hält die Fahrt an, solange der Boss steht.
    if (boss.blocking && distance >= boss.arenaZ) distance = boss.arenaZ;

    const nextSector = director.sectorAt(distance).index;
    if (nextSector !== sector) {
      sector = nextSector;
      army.tryPromote();
    }
    if (army.defeated) {
      return { power: 0, kills, lost, died: true, peakAlive, bossesFought, bossesKilled, firstBossCost };
    }
  }
  return {
    power: army.combatPower, kills, lost, died: false, peakAlive,
    bossesFought, bossesKilled, firstBossCost,
  };
}

function sample(seconds: number, smart: boolean, count = 12): RunOutcome[] {
  return Array.from({ length: count }, (_, seed) => playRun(seed, seconds, smart));
}

describe('combat balance', { timeout: 120_000 }, () => {
  /**
   * Die erste Minute gehört dem Ankommen. Wer die Regeln noch lernt, darf
   * nicht von der Horde überrannt werden.
   */
  it('leaves the opening minute harmless', () => {
    const runs = sample(55, true);
    expect(runs.every((run) => !run.died)).toBe(true);
    expect(runs.every((run) => run.lost === 0)).toBe(true);
  });

  /** Aber Zombies müssen sterben, sonst wäre die Feuerkraft Dekoration. */
  it('still mows down a horde from the start', () => {
    const kills = sample(55, true).map((run) => run.kills);
    expect(Math.min(...kills)).toBeGreaterThan(30);
  });

  /**
   * Später muss der Kampf etwas kosten. Solange kein Zombie je die Linie
   * erreicht, ist die ganze Horde nur ein hochzählender Zähler.
   */
  it('starts costing real power in the second half', () => {
    const runs = sample(260, true);
    const withLosses = runs.filter((run) => run.lost > 0).length;
    expect(withLosses).toBeGreaterThanOrEqual(runs.length - 1);
  });

  /**
   * Wer gut wählt, kommt meistens durch — aber nicht immer. Mit drei Bossen
   * in einer langen Runde soll ein Scheitern möglich bleiben, sonst gibt es
   * keinen Grund, die Karten sorgfältig zu wählen.
   */
  it('lets a good player usually survive a full run', () => {
    const runs = sample(260, true, 20);
    const survived = runs.filter((run) => !run.died).length;
    expect(survived / runs.length).toBeGreaterThanOrEqual(0.8);
    expect(survived).toBeLessThan(runs.length + 1);
  });

  /** Wer blind fährt, kommt fast nie durch. */
  it('kills a player who never reads the gates', () => {
    const blind = sample(260, false, 20).filter((run) => run.died).length;
    const good = sample(260, true, 20).filter((run) => run.died).length;
    expect(blind).toBeGreaterThan(good * 3);
    expect(blind / 20).toBeGreaterThan(0.5);
  });

  /** Die Horde darf das Renderbudget nie sprengen. */
  it('never exceeds the enemy render budget', () => {
    for (const seconds of [60, 160, 260]) {
      const peak = Math.max(...sample(seconds, true, 8).map((run) => run.peakAlive));
      expect(peak).toBeLessThanOrEqual(DISPLAY_CAPS.enemiesHard);
    }
  });
});

describe('boss balance', { timeout: 120_000 }, () => {
  /** Ein Boss, der nie fällt, ist eine Wand statt eines Gegners. */
  it('can be beaten by a player who is doing well', () => {
    const runs = sample(200, true, 20);
    const reached = runs.filter((run) => run.bossesFought > 0);
    expect(reached.length).toBe(runs.length);
    expect(runs.filter((run) => run.bossesKilled > 0).length).toBeGreaterThanOrEqual(17);
  });

  /**
   * Und er muss etwas kosten. Der Zielkorridor ist rund ein Drittel der
   * Kampfkraft: darunter ist er Kulisse, darüber beendet er die Runde.
   */
  it('costs about a third of the army', () => {
    const costs = sample(200, true, 20)
      .filter((run) => run.bossesKilled > 0)
      .map((run) => run.firstBossCost)
      .sort((a, b) => a - b);
    const median = costs[Math.floor(costs.length / 2)]!;
    expect(median).toBeGreaterThan(0.15);
    expect(median).toBeLessThan(0.55);
  });

  /**
   * Der Boss darf nicht am eigenen Feuer vorbeigehen: Wird er schon beim
   * Aufstellen als Ziel behandelt, versickert die Feuerkraft zwanzig
   * Sekunden lang in einem Gegner, der noch gar nicht da ist — und die
   * Horde läuft ungestört durch. Genau das ist einmal passiert.
   */
  it('does not swallow firepower before the fight starts', () => {
    const runs = sample(55, true, 12);
    expect(runs.every((run) => run.bossesFought === 0)).toBe(true);
    expect(runs.every((run) => run.lost === 0)).toBe(true);
  });

  it('shows up several times in a long run', () => {
    const killed = sample(260, true, 20)
      .map((run) => run.bossesKilled)
      .sort((a, b) => a - b);
    expect(killed[Math.floor(killed.length / 2)]!).toBeGreaterThanOrEqual(2);
  });
});
