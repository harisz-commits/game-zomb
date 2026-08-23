import { describe, expect, it } from 'vitest';
import { BossManager, bossDeathProgress } from '../src/enemies/BossManager';
import { BOSSES, BOSS_RULES, bossForThreat } from '../src/config/bosses';

const STEP = 1 / 60;

/** Stellt einen Boss auf und fährt die Armee in die Arena. */
function engaged(power = 1000, threat = 0): BossManager {
  const boss = new BossManager();
  boss.place(200, threat);
  boss.update(STEP, boss.arenaZ, power);
  return boss;
}

describe('boss selection', () => {
  it('picks the strongest boss the threat level allows', () => {
    expect(bossForThreat(0).id).toBe(BOSSES[0]!.id);
    const late = bossForThreat(100);
    expect(late.hpShare).toBeGreaterThanOrEqual(BOSSES[0]!.hpShare);
  });

  it('never steps back to a weaker boss as threat grows', () => {
    let previous = 0;
    for (let threat = 0; threat < 40; threat += 1) {
      const share = bossForThreat(threat).hpShare;
      expect(share).toBeGreaterThanOrEqual(previous);
      previous = share;
    }
  });
});

describe('boss arena', () => {
  /**
   * Wie eine Welle bekommt der Boss seine Werte erst beim Betreten der
   * Arena — sonst stünde am Sektorende ein Gegner, der zur Armee von vor
   * zwanzig Sekunden passt.
   */
  it('takes its strength from the army that arrives', () => {
    const boss = new BossManager();
    boss.place(200, 0);
    // Noch weit weg: keine Werte.
    boss.update(STEP, 0, 1000);
    expect(boss.current!.armed).toBe(false);

    boss.update(STEP, boss.arenaZ, 50_000);
    expect(boss.current!.maxHp).toBeCloseTo(50_000 * boss.current!.spec.hpShare);
  });

  it('holds the run only while it is alive', () => {
    const boss = engaged();
    expect(boss.blocking).toBe(true);
    boss.damage(boss.current!.maxHp);
    expect(boss.blocking).toBe(false);
  });

  it('gives the player a moment before the first blow', () => {
    const boss = engaged();
    let elapsed = 0;
    let firstHit = -1;
    for (let i = 0; i < 600; i += 1) {
      elapsed += STEP;
      if (boss.update(STEP, 500, 1000).damageToArmy > 0) {
        firstHit = elapsed;
        break;
      }
    }
    expect(firstHit).toBeGreaterThan(BOSS_RULES.openingDelay * 0.8);
    expect(firstHit).toBeLessThan(BOSS_RULES.openingDelay * 1.6);
  });

  it('hits harder and faster as its health falls', () => {
    const hits = (hpRatio: number): { count: number; total: number } => {
      const boss = engaged();
      boss.damage(boss.current!.maxHp * (1 - hpRatio));
      let count = 0;
      let total = 0;
      for (let i = 0; i < 60 * 12; i += 1) {
        const tick = boss.update(STEP, 500, 1000);
        if (tick.damageToArmy > 0) {
          count += 1;
          total += tick.damageToArmy;
        }
      }
      return { count, total };
    };
    const early = hits(0.9);
    const late = hits(0.1);
    expect(late.count).toBeGreaterThan(early.count);
    expect(late.total).toBeGreaterThan(early.total * 1.5);
  });

  it('only summons in the later phases', () => {
    const summonsAt = (hpRatio: number): number => {
      const boss = engaged();
      boss.damage(boss.current!.maxHp * (1 - hpRatio));
      let count = 0;
      for (let i = 0; i < 60 * 12; i += 1) {
        if (boss.update(STEP, 500, 1000).summoned) count += 1;
      }
      return count;
    };
    expect(summonsAt(0.9)).toBe(0);
    expect(summonsAt(0.2)).toBeGreaterThan(0);
  });

  it('reports the killing blow exactly once', () => {
    const boss = engaged();
    expect(boss.damage(boss.current!.maxHp / 2)).toBe(false);
    expect(boss.damage(boss.current!.maxHp)).toBe(true);
    expect(boss.damage(999_999)).toBe(false);
  });

  it('collapses and then clears itself', () => {
    const boss = engaged();
    boss.damage(boss.current!.maxHp);
    expect(bossDeathProgress(boss.current!)).toBe(0);

    let finished = false;
    for (let i = 0; i < 60 * 5 && !finished; i += 1) {
      finished = boss.update(STEP, 500, 1000).finished;
    }
    expect(finished).toBe(true);
    expect(boss.current).toBeNull();
  });

  it('deals no damage once it is dying', () => {
    const boss = engaged();
    boss.damage(boss.current!.maxHp);
    for (let i = 0; i < 60; i += 1) {
      expect(boss.update(STEP, 500, 1000).damageToArmy).toBe(0);
    }
  });

  it('reports health as a ratio for the bar', () => {
    const boss = engaged();
    expect(boss.hpRatio).toBeCloseTo(1);
    boss.damage(boss.current!.maxHp * 0.25);
    expect(boss.hpRatio).toBeCloseTo(0.75);
  });
});
