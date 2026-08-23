import { describe, expect, it } from 'vitest';
import { EnemyManager, deathProgress } from '../src/enemies/EnemyManager';
import { ZombieSpawner } from '../src/enemies/ZombieSpawner';
import { resolveCombat, remainingHp } from '../src/combat/CombatSystem';
import { COMBAT, WAVES } from '../src/config/combat';
import { ENEMY_ARCHETYPES, archetypesAtThreat } from '../src/config/enemyStats';

/** Mit Armeestärke 1 sind die Anteile zugleich Absolutwerte. */
function arm(enemies: EnemyManager): EnemyManager {
  enemies.update(0, 0, 0, 1);
  return enemies;
}

function baseInput(overrides: Partial<Parameters<typeof resolveCombat>[0]> = {}) {
  return {
    dt: 1 / 60,
    combatPower: 1000,
    tierIndex: 0,
    armyX: 0,
    armyZ: 0,
    armyHalfWidth: 2,
    fireRate: 1,
    damage: 1,
    armor: 0,
    ...overrides,
  };
}

describe('wave spawning', () => {
  /**
   * Der Kern des Modells: Wellen skalieren mit der Armee. Feste Werte
   * könnten einer Kurve über zwölf Zehnerpotenzen nicht folgen.
   */
  it('scales wave hp with the army it faces', () => {
    const wave = new ZombieSpawner(1).due(0, 0)[0]!;
    const build = (power: number): EnemyManager => {
      const e = new EnemyManager();
      e.spawn(wave);
      // Armee so weit vorne, dass die Welle in Reichweite ist.
      e.update(0, 0, wave.z, power);
      return e;
    };
    const hpOf = (e: EnemyManager): number =>
      e.all.reduce((sum, enemy) => sum + enemy.hp, 0);
    expect(hpOf(build(100))).toBeGreaterThan(0);
    expect(hpOf(build(100_000)) / hpOf(build(100))).toBeCloseTo(1000, 0);
  });

  /**
   * Eine Welle entsteht zwanzig Sekunden im Voraus. Ihre Stärke darf erst
   * beim Eintreffen feststehen — sonst trifft sie eine Armee, die inzwischen
   * ein Vielfaches stark ist, wirkungslos.
   */
  it('takes its strength from the army it actually meets', () => {
    const wave = new ZombieSpawner(1).due(0, 0)[0]!;
    const enemies = new EnemyManager();
    enemies.spawn(wave);

    // Noch weit voraus: die Welle hat keine Werte.
    enemies.update(0, 0, wave.z - 120, 100);
    expect(enemies.all.every((e) => e.hp === 0)).toBe(true);

    // In Reichweite: jetzt zählt die Stärke von JETZT, nicht die von damals.
    enemies.update(0, 0, wave.z, 100_000);
    expect(enemies.all.every((e) => e.hp > 0)).toBe(true);
    const total = enemies.all.reduce((sum, e) => sum + e.hp, 0);
    expect(total).toBeGreaterThan(100_000 * 0.3);
  });

  it('splits the budget by toughness, not evenly', () => {
    const wave = new ZombieSpawner(9).due(0, 8)[0]!;
    const byType = new Map<string, number>();
    for (const m of wave.members) byType.set(m.archetype, m.hpShare);
    const walker = byType.get('walker');
    const tank = byType.get('tank');
    if (walker !== undefined && tank !== undefined) {
      const walkerFactor = ENEMY_ARCHETYPES.find((e) => e.id === 'walker')!.hpFactor;
      const tankFactor = ENEMY_ARCHETYPES.find((e) => e.id === 'tank')!.hpFactor;
      expect(tank / walker).toBeCloseTo(tankFactor / walkerFactor, 4);
    }
  });

  it('only fields archetypes the threat level allows', () => {
    for (const threat of [0, 1, 3, 6, 12]) {
      const allowed = new Set(archetypesAtThreat(threat).map((e) => e.id));
      for (const wave of new ZombieSpawner(threat).due(0, threat)) {
        for (const member of wave.members) expect(allowed.has(member.archetype)).toBe(true);
      }
    }
  });

  it('never fields more zombies than the render budget', () => {
    for (const threat of [0, 5, 20, 100]) {
      const wave = new ZombieSpawner(3).due(0, threat)[0]!;
      expect(wave.members.length).toBeLessThanOrEqual(WAVES.countMax);
    }
  });

  it('is reproducible from its seed', () => {
    const a = new ZombieSpawner(555).due(0, 4);
    const b = new ZombieSpawner(555).due(0, 4);
    expect(a).toEqual(b);
  });

  it('keeps the first wave out of the starting stretch', () => {
    const first = new ZombieSpawner(2).due(0, 0)[0]!;
    expect(first.z).toBeGreaterThanOrEqual(WAVES.firstWaveMeters);
  });
});

describe('combat resolution', () => {
  it('does nothing without enemies', () => {
    const outcome = resolveCombat(baseInput(), new EnemyManager());
    expect(outcome).toEqual({ powerLost: 0, kills: 0, engaged: 0, bossKilled: false });
  });

  it('shoots only what is in range and in front', () => {
    const enemies = new EnemyManager();
    enemies.spawn({
      index: 0, z: 0, threat: 0,
      members: [
        { archetype: 'walker', x: 0, z: 10, speed: 1, hpShare: 100, damageShare: 0 },
        // Scharf gemacht, aber ausserhalb der Feuerreichweite.
        { archetype: 'walker', x: 0, z: COMBAT.fireRange + 5, speed: 1, hpShare: 100, damageShare: 0 },
      ],
    });
    arm(enemies);
    const [near, far] = enemies.all;
    expect(far!.hp).toBe(100);

    const outcome = resolveCombat(baseInput(), enemies);
    expect(outcome.engaged).toBe(1);
    expect(near!.hp).toBeLessThan(100);
    expect(far!.hp).toBe(100);
  });

  it('loses power to every zombie that reaches the line', () => {
    const enemies = new EnemyManager();
    enemies.spawn({
      index: 0, z: 0, threat: 0,
      members: [{ archetype: 'walker', x: 0, z: 0, speed: 1, hpShare: 1e9, damageShare: 120 }],
    });
    arm(enemies);
    const outcome = resolveCombat(baseInput({ dt: 0.5 }), enemies);
    expect(outcome.powerLost).toBeCloseTo(60);
  });

  it('reduces incoming damage with armour but never to nothing', () => {
    const build = (): EnemyManager => {
      const e = new EnemyManager();
      e.spawn({
        index: 0, z: 0, threat: 0,
        members: [{ archetype: 'walker', x: 0, z: 0, speed: 1, hpShare: 1e9, damageShare: 100 }],
      });
      arm(e);
      return e;
    };
    const plain = resolveCombat(baseInput({ dt: 1 }), build()).powerLost;
    const armoured = resolveCombat(baseInput({ dt: 1, armor: 0.5 }), build()).powerLost;
    const maxed = resolveCombat(baseInput({ dt: 1, armor: 5 }), build()).powerLost;
    expect(armoured).toBeCloseTo(plain * 0.5);
    expect(maxed).toBeGreaterThan(0);
  });

  it('kills faster with more firepower', () => {
    const build = (): EnemyManager => {
      const e = new EnemyManager();
      e.spawn({
        index: 0, z: 0, threat: 0,
        members: [{ archetype: 'walker', x: 0, z: 5, speed: 1, hpShare: 200, damageShare: 0 }],
      });
      arm(e);
      return e;
    };
    const weak = build();
    resolveCombat(baseInput({ dt: 0.2 }), weak);
    const strong = build();
    resolveCombat(baseInput({ dt: 0.2, damage: 3 }), strong);
    expect(strong.all[0]!.hp).toBeLessThan(weak.all[0]!.hp);
  });

  it('spreads fire instead of focusing one zombie', () => {
    const enemies = new EnemyManager();
    enemies.spawn({
      index: 0, z: 0, threat: 0,
      members: Array.from({ length: 4 }, (_, i) => ({
        archetype: 'walker' as const, x: 0, z: 4 + i, speed: 1, hpShare: 500, damageShare: 0,
      })),
    });
    arm(enemies);
    resolveCombat(baseInput({ dt: 0.25 }), enemies);
    const damaged = enemies.all.filter((e) => e.hp < 500);
    expect(damaged).toHaveLength(4);
  });

  it('counts a kill exactly once', () => {
    const enemies = new EnemyManager();
    enemies.spawn({
      index: 0, z: 0, threat: 0,
      members: [{ archetype: 'walker', x: 0, z: 4, speed: 1, hpShare: 1, damageShare: 0 }],
    });
    arm(enemies);
    const first = resolveCombat(baseInput({ dt: 1 }), enemies);
    const second = resolveCombat(baseInput({ dt: 1 }), enemies);
    expect(first.kills).toBe(1);
    expect(second.kills).toBe(0);
    expect(remainingHp(enemies.all)).toBe(0);
  });
});

describe('horde movement', () => {
  it('closes in on the army and homes sideways only slowly', () => {
    const enemies = new EnemyManager();
    enemies.spawn({
      index: 0, z: 0, threat: 0,
      members: [{ archetype: 'walker', x: 4, z: 20, speed: 3, hpShare: 10, damageShare: 1 }],
    });
    arm(enemies);
    enemies.update(1, 0, 0, 1);
    const enemy = enemies.all[0]!;
    expect(enemy.z).toBeCloseTo(17);
    // Ausweichen muss wirken: der Zombie darf nicht sofort danebenstehen.
    expect(enemy.x).toBeGreaterThan(1);
  });

  it('lets dying zombies collapse and then clears them', () => {
    const enemies = new EnemyManager();
    enemies.spawn({
      index: 0, z: 0, threat: 0,
      members: [{ archetype: 'walker', x: 0, z: 5, speed: 0, hpShare: 10, damageShare: 0 }],
    });
    arm(enemies);
    enemies.kill(enemies.all[0]!);
    expect(deathProgress(enemies.all[0]!)).toBe(0);
    enemies.update(COMBAT.deathFadeSeconds / 2, 0, 0, 1);
    expect(deathProgress(enemies.all[0]!)).toBeCloseTo(0.5, 1);
    enemies.update(COMBAT.deathFadeSeconds, 0, 0, 1);
    expect(enemies.all).toHaveLength(0);
  });

  it('forgets zombies left far behind', () => {
    const enemies = new EnemyManager();
    enemies.spawn({
      index: 0, z: 0, threat: 0,
      members: [{ archetype: 'walker', x: 0, z: 0, speed: 0, hpShare: 10, damageShare: 0 }],
    });
    arm(enemies);
    enemies.update(0.016, 0, WAVES.cleanupMeters + 10, 1);
    expect(enemies.all).toHaveLength(0);
  });

  it('only counts a bite when the zombie is actually at the line', () => {
    const enemies = new EnemyManager();
    enemies.spawn({
      index: 0, z: 0, threat: 0,
      members: [
        { archetype: 'walker', x: 0, z: 0, speed: 0, hpShare: 10, damageShare: 1 },
        { archetype: 'walker', x: 40, z: 0, speed: 0, hpShare: 10, damageShare: 1 },
        { archetype: 'walker', x: 0, z: 25, speed: 0, hpShare: 10, damageShare: 1 },
      ],
    });
    arm(enemies);
    expect(enemies.contacting(0, 0, 2)).toHaveLength(1);
  });
});
