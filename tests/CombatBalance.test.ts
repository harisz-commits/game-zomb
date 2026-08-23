import { describe, expect, it } from 'vitest';
import { GateSystem } from '../src/run/GateSystem';
import { ArmyManager } from '../src/army/ArmyManager';
import { EnemyManager } from '../src/enemies/EnemyManager';
import { ZombieSpawner } from '../src/enemies/ZombieSpawner';
import { resolveCombat } from '../src/combat/CombatSystem';
import { RunModifiers } from '../src/run/RunModifiers';
import { EventBus } from '../src/core/EventBus';
import { ARMY, DISPLAY_CAPS, MOVEMENT, RUN } from '../src/config/gameBalance';
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
  const gates = new GateSystem(seed);
  const enemies = new EnemyManager();
  const spawner = new ZombieSpawner(seed ^ 0x51ed270b);

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
    for (const wave of spawner.due(distance, threat)) enemies.spawn(wave);
    enemies.update(STEP, x, distance, army.combatPower);

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
    );
    kills += outcome.kills;
    lost += outcome.powerLost;
    if (outcome.powerLost > 0) army.damage(outcome.powerLost);
    peakAlive = Math.max(peakAlive, enemies.aliveCount);

    const nextSector = Math.floor(distance / RUN.sectorLengthMeters);
    if (nextSector !== sector) {
      sector = nextSector;
      army.tryPromote();
    }
    if (army.defeated) return { power: 0, kills, lost, died: true, peakAlive };
  }
  return { power: army.combatPower, kills, lost, died: false, peakAlive };
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

  /** Wer gut wählt, überlebt eine reguläre Runde. */
  it('lets a good player survive a full run', () => {
    const died = sample(260, true).filter((run) => run.died).length;
    expect(died).toBeLessThanOrEqual(1);
  });

  /** Wer blind fährt, nicht. */
  it('kills a player who never reads the gates', () => {
    const died = sample(260, false).filter((run) => run.died).length;
    expect(died).toBeGreaterThan(sample(260, true).filter((run) => run.died).length + 4);
  });

  /** Die Horde darf das Renderbudget nie sprengen. */
  it('never exceeds the enemy render budget', () => {
    for (const seconds of [60, 160, 260]) {
      const peak = Math.max(...sample(seconds, true, 8).map((run) => run.peakAlive));
      expect(peak).toBeLessThanOrEqual(DISPLAY_CAPS.enemiesHard);
    }
  });
});
