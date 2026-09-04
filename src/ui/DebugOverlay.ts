import Phaser from 'phaser';
import type { BattleContext } from '../core/BattleContext';

export interface DebugActions {
  forcePromotion: () => void;
  spawnBoss: () => void;
  spawnZombies: (count: number) => void;
  addReinforcement: () => void;
  killAll: () => void;
  wipeArmy: () => void;
}

/**
 * `?debug=true` overlay. Never included in a normal production run
 * (see `isDebugEnabled`), so it is safe to be verbose here.
 *
 * Hotkeys: P promote, B boss, Z +20 zombies, R reinforcement, K kill all,
 * G wipe the army (to exercise the game-over path).
 */
export class DebugOverlay {
  private readonly text: Phaser.GameObjects.Text;
  private readonly bg: Phaser.GameObjects.Rectangle;
  private accumulator = 0;

  constructor(
    private readonly ctx: BattleContext,
    actions: DebugActions,
  ) {
    const scene = ctx.scene;

    this.bg = scene.add.rectangle(0, 0, 230, 190, 0x05070c, 0.72).setOrigin(0, 0).setDepth(300);
    this.text = scene.add
      .text(0, 0, '', {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: '#8affc1',
        lineSpacing: 2,
      })
      .setOrigin(0, 0)
      .setDepth(301);

    ctx.uiLayer.add([this.bg, this.text]);

    const keyboard = scene.input.keyboard;
    if (keyboard) {
      keyboard.on('keydown-P', actions.forcePromotion);
      keyboard.on('keydown-B', actions.spawnBoss);
      keyboard.on('keydown-Z', () => actions.spawnZombies(20));
      keyboard.on('keydown-R', actions.addReinforcement);
      keyboard.on('keydown-K', actions.killAll);
      keyboard.on('keydown-G', actions.wipeArmy);
    }
  }

  resize(width: number, height: number): void {
    const x = 10;
    const y = Math.min(height - 200, 110);
    this.bg.setPosition(x, y).setSize(Math.min(240, width - 20), 190);
    this.text.setPosition(x + 8, y + 8);
  }

  update(dt: number): void {
    this.accumulator += dt;
    if (this.accumulator < 0.25) return;
    this.accumulator = 0;

    const ctx = this.ctx;
    const heap = performance.memory
      ? `${(performance.memory.usedJSHeapSize / 1048576).toFixed(0)} MB`
      : 'n/a';

    const lines = [
      `FPS         ${ctx.quality.fps.toFixed(0)}  [${ctx.quality.level}]`,
      `HEAP        ${heap}`,
      `SOLDIERS    ${ctx.army.count} (${ctx.army.currentTier.id})`,
      `ZOMBIES     ${ctx.enemies.activeCount}`,
      `TRACERS     ${ctx.effects.debugCounts.tracers}`,
      `PARTICLES   ${ctx.effects.debugCounts.particles}`,
      `DPS ~       ${Math.round(ctx.combat.estimatedDps)}`,
      `FIRE RATE   ${ctx.combat.currentFireRate.toFixed(2)}/s`,
      `SPAWN RATE  ${ctx.director
        .spawnRate({
          elapsed: ctx.runtime.elapsed,
          armyPower: ctx.army.armyPower,
          promotionCount: ctx.promotion.promotions,
          kills: ctx.score.kills,
          armySize: ctx.army.count,
          activeZombies: ctx.enemies.activeCount,
        })
        .toFixed(2)}/s`,
      `PROMOTIONS  ${ctx.promotion.promotions}`,
      `TIER        ${ctx.army.currentTier.name} (x${ctx.army.tierPower})`,
      `SEED        ${ctx.rng.seed}`,
      `P promote  B boss  Z +20`,
      `R reinforce  K kill all  G wipe`,
    ];
    this.text.setText(lines.join('\n'));
  }
}
