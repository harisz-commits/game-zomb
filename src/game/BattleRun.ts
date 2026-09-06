import { BALANCE } from '../config/BalanceConfig';
import type { BattleContext } from '../core/BattleContext';
import { createRuntimeState } from '../core/BattleContext';
import { EventBus, GameEvent } from '../core/EventBus';
import { nextRunSeed, save } from '../core/Services';
import { Viewport } from '../core/Viewport';
import { BattleView } from '../render3d/BattleView';
import type { Stage } from '../render3d/Stage';
import { ArmySystem } from '../systems/ArmySystem';
import { audio } from '../systems/AudioSystem';
import { CombatSystem } from '../systems/CombatSystem';
import { EnemyDirector } from '../systems/EnemyDirector';
import { EnemySystem } from '../systems/EnemySpawnSystem';
import { EffectsSystem } from '../systems/EffectsSystem';
import { InputSystem } from '../systems/InputSystem';
import { LaneObjectSystem } from '../systems/LaneObjectSystem';
import { PromotionSystem } from '../systems/PromotionSystem';
import { QualityManager } from '../systems/QualityManager';
import { ScoreSystem } from '../systems/ScoreSystem';
import { UpgradeSystem } from '../systems/UpgradeSystem';
import { playables } from '../systems/YouTubePlayablesAdapter';
import type { EnemyKind, GameMode, RunStats, UpgradeDefinition, WavePhase } from '../types/game';
import { Hud } from '../ui/Hud';
import { SeededRandom } from '../utils/SeededRandom';

/**
 * One run, from first frame to summary screen.
 *
 * This is the orchestrator the old `BattleScene` was, minus the engine: it
 * owns the systems, steps them, and turns their events into the run's
 * lifecycle. Rendering is entirely `BattleView`'s business, and the UI is DOM.
 */
export class BattleRun {
  readonly ctx: BattleContext;
  private readonly view: BattleView;
  private readonly input: InputSystem;
  private readonly hud: Hud;

  private finalBossSpawned = false;
  private endingRun = false;
  private endlessBossTimer = BALANCE.ENDLESS_BOSS_INTERVAL;
  private promotionDelay = 0;
  private pendingDraft: UpgradeDefinition[] | null = null;
  private endTimer = 0;
  private endVictory = false;
  private readonly timers: { at: number; run: () => void }[] = [];
  private readonly unsubscribe: (() => void)[] = [];

  constructor(
    private readonly mode: GameMode,
    private readonly stage: Stage,
    canvas: HTMLCanvasElement,
    overlay: HTMLElement,
    worldLabels: HTMLElement,
    private readonly hooks: {
      openDraft: (choices: UpgradeDefinition[], choose: (u: UpgradeDefinition) => void) => void;
      finish: (stats: RunStats, bestScore: number, isNewBest: boolean) => void;
    },
  ) {
    const viewport = new Viewport();
    viewport.update(stage.renderer.domElement.width, stage.renderer.domElement.height);

    const events = new EventBus();

    const ctx = {
      events,
      rng: new SeededRandom(nextRunSeed()),
      viewport,
      quality: new QualityManager(),
      runtime: createRuntimeState(mode),
    } as unknown as BattleContext;

    ctx.promotion = new PromotionSystem();
    ctx.upgrades = new UpgradeSystem(ctx.rng);
    ctx.score = new ScoreSystem();
    ctx.director = new EnemyDirector(ctx.rng, {
      onPhase: (phase) => this.onPhaseChanged(phase),
      onModifier: (label) => events.emit(GameEvent.ENDLESS_MODIFIER, { label }),
    });
    ctx.effects = new EffectsSystem(ctx.quality);
    ctx.army = new ArmySystem(ctx);
    ctx.enemies = new EnemySystem(ctx);
    ctx.combat = new CombatSystem(ctx);
    ctx.laneObjects = new LaneObjectSystem(ctx);
    this.ctx = ctx;

    // The army must exist before the view: the view builds its soldier
    // geometry from the current tier on construction.
    ctx.army.create();
    this.view = new BattleView(stage, ctx, worldLabels);
    ctx.director.start(mode);
    ctx.laneObjects.create();

    this.input = new InputSystem(ctx, canvas, (x, y) => this.view.pointerToWorldX(x, y));
    this.input.create();
    this.hud = new Hud(ctx, overlay);

    this.bindEvents();
    this.unsubscribe.push(playables.onPause(() => (ctx.runtime.paused = true)));
    this.unsubscribe.push(playables.onResume(() => (ctx.runtime.paused = false)));

    audio.startMusic();
    this.showTutorial();
  }

  /* --------------------------------------------------------------- events */

  private bindEvents(): void {
    const ctx = this.ctx;

    ctx.events.on(GameEvent.ENEMY_KILLED, (payload) => {
      ctx.score.addKill(payload.elite, payload.boss);
      ctx.army.addReinforcementPoints(payload.points);
      if (ctx.rng.bool(0.12)) audio.play('zombiehit', 0.6);
    });
    ctx.events.on(GameEvent.ENEMY_DAMAGED, (payload) => {
      ctx.effects.damageNumber(payload.x, payload.y - 12, payload.amount, payload.crit);
    });
    ctx.events.on(GameEvent.SOLDIER_ADDED, () => ctx.score.trackArmySize(ctx.army.count));
    ctx.events.on(GameEvent.SOLDIER_DIED, (payload) => {
      if (payload.remaining <= 0) this.beginGameOver();
    });
    ctx.events.on(GameEvent.DOCTRINE_UNLOCKED, () => {
      audio.play('legendary', 0.8);
      ctx.effects.shake(0.006, 0.25);
    });
    ctx.events.on(GameEvent.BOSS_KILLED, () => {
      if (this.mode === 'CAMPAIGN' && this.finalBossSpawned) this.beginVictory();
    });
  }

  private onPhaseChanged(phase: WavePhase): void {
    const ctx = this.ctx;
    ctx.events.emit(GameEvent.PHASE_CHANGED, { label: phase.label });
    switch (phase.event) {
      case 'ELITE_ENCOUNTER': {
        const kinds: EnemyKind[] = ['WALKER', 'BRUTE', 'ARMORED'];
        for (const kind of kinds) ctx.enemies.spawn(kind, true);
        break;
      }
      case 'MINI_BOSS':
        ctx.enemies.spawnBoss('BOSS_CRUSHER', 0.5);
        break;
      case 'FINAL_BOSS':
        this.finalBossSpawned = true;
        ctx.enemies.spawnBoss('BOSS_ABOMINATION', 1.25);
        break;
      default:
        break;
    }
  }

  private showTutorial(): void {
    if (save.current.tutorialCompleted) return;
    const ctx = this.ctx;
    ctx.events.emit(GameEvent.TUTORIAL_HINT, { text: 'DRAG TO MOVE', duration: 3 });
    this.after(7, () =>
      ctx.events.emit(GameEvent.TUTORIAL_HINT, { text: 'YOU SHOOT STRAIGHT AHEAD', duration: 3 }),
    );
    this.after(14, () =>
      ctx.events.emit(GameEvent.TUTORIAL_HINT, {
        text: 'LEFT: BREAK SUPPLY · RIGHT: HOLD THE HORDE',
        duration: 4,
      }),
    );
  }

  /** A timer in *game* seconds, so a pause pauses it too. */
  private after(seconds: number, run: () => void): void {
    this.timers.push({ at: this.ctx.runtime.elapsed + seconds, run });
  }

  /* --------------------------------------------------------------- update */

  update(frameDt: number): void {
    const ctx = this.ctx;
    if (ctx.runtime.paused) return;
    // A quality change is mostly a renderer change now - shadows, shadow map
    // size, pixel ratio - so it goes straight to the stage.
    if (ctx.quality.update(frameDt)) this.stage.applyQuality(ctx.quality.settings);

    const dt = frameDt * ctx.runtime.timeScale;

    if (!ctx.runtime.frozen && dt > 0) {
      if (!ctx.runtime.over) ctx.runtime.elapsed += dt;

      this.input.update(dt);
      ctx.army.update(dt);
      ctx.enemies.update(dt);
      ctx.laneObjects.update(dt);
      ctx.combat.update(dt);

      ctx.score.setElapsed(ctx.runtime.elapsed);
      ctx.score.setPromotions(ctx.promotion.promotions);

      this.checkPromotion();
      this.checkEndlessBoss(dt);
      this.runTimers();
    }

    if (this.promotionDelay > 0) {
      this.promotionDelay -= frameDt;
      if (this.promotionDelay <= 0) this.openDraft();
    }
    if (this.endTimer > 0) {
      this.endTimer -= frameDt;
      if (this.endTimer <= 0) this.finishRun(this.endVictory);
    }

    ctx.effects.update(frameDt);
    this.view.update(ctx.runtime.frozen ? frameDt * 0.15 : dt, ctx.runtime.frozen);
    audio.update(frameDt);
    this.hud.update(frameDt);
  }

  private runTimers(): void {
    for (let i = this.timers.length - 1; i >= 0; i--) {
      if (this.ctx.runtime.elapsed < this.timers[i].at) continue;
      const timer = this.timers[i];
      this.timers.splice(i, 1);
      if (!this.ctx.runtime.over && !this.ctx.runtime.frozen) timer.run();
    }
  }

  /* ------------------------------------------------------------ promotion */

  private checkPromotion(): void {
    const ctx = this.ctx;
    if (ctx.runtime.frozen || ctx.runtime.over) return;
    if (!ctx.promotion.isReady(ctx.army.count, ctx.upgrades.modifiers)) return;
    this.startPromotion(false);
  }

  /**
   * The central 140-soldier moment: brief slow-mo, freeze, draft one of three
   * cards, then convert the army to the next tier.
   */
  startPromotion(forced: boolean): void {
    const ctx = this.ctx;
    if (ctx.runtime.frozen || ctx.runtime.over) return;
    if (forced && ctx.army.count < 2) return;

    ctx.runtime.frozen = true;
    ctx.runtime.timeScale = BALANCE.PROMOTION_SLOWMO;
    ctx.events.emit(GameEvent.PROMOTION_READY, {
      promotionIndex: ctx.promotion.promotions + 1,
    });
    this.pendingDraft = ctx.upgrades.generateChoices(ctx.promotion.promotions + 1).choices;
    this.promotionDelay = BALANCE.PROMOTION_FREEZE_TIME;
  }

  private openDraft(): void {
    const ctx = this.ctx;
    const choices = this.pendingDraft;
    this.pendingDraft = null;
    if (!choices) return;
    ctx.runtime.timeScale = 0;

    this.hooks.openDraft(choices, (definition) => {
      const unlock = ctx.upgrades.apply(definition);
      ctx.events.emit(GameEvent.PROMOTION_SELECTED, {
        upgrade: definition,
        rarity: definition.rarity,
      });
      if (unlock) {
        ctx.events.emit(GameEvent.DOCTRINE_UNLOCKED, {
          family: unlock.definition.family,
          name: unlock.definition.name,
          level: unlock.level,
        });
      }
      ctx.army.refreshStats();

      const result = ctx.promotion.promote(ctx.army.count);
      ctx.army.applyPromotion(result.toTier, result.toCount);
      ctx.score.setPromotions(ctx.promotion.promotions);
      ctx.effects.shake(0.008, 0.25);
      ctx.events.emit(GameEvent.PROMOTION_COMPLETE, {
        tierName: result.toTier.name,
        count: result.toCount,
      });

      ctx.runtime.frozen = false;
      ctx.runtime.timeScale = 1;
    });
  }

  /* --------------------------------------------------------------- bosses */

  private checkEndlessBoss(dt: number): void {
    if (this.mode !== 'ENDLESS') return;
    const ctx = this.ctx;
    this.endlessBossTimer -= dt;
    if (this.endlessBossTimer > 0 || ctx.runtime.bossActive) return;
    this.endlessBossTimer = BALANCE.ENDLESS_BOSS_INTERVAL;
    const kind: EnemyKind = ctx.rng.bool(0.5) ? 'BOSS_CRUSHER' : 'BOSS_ABOMINATION';
    ctx.enemies.spawnBoss(kind, 0.7 + ctx.runtime.elapsed / 260);
  }

  /* -------------------------------------------------------------- run end */

  private beginGameOver(): void {
    if (this.endingRun) return;
    this.endingRun = true;
    const ctx = this.ctx;
    ctx.runtime.over = true;
    ctx.runtime.timeScale = 0.3;
    ctx.events.emit(GameEvent.GAME_OVER, {});
    audio.stopMusic();
    audio.play('gameover');
    ctx.effects.shake(0.012, 0.5);
    this.endVictory = false;
    this.endTimer = BALANCE.GAME_OVER_SLOWMO_TIME;
  }

  private beginVictory(): void {
    if (this.endingRun) return;
    this.endingRun = true;
    const ctx = this.ctx;
    ctx.runtime.over = true;
    ctx.runtime.victory = true;
    ctx.runtime.timeScale = 0.4;
    ctx.events.emit(GameEvent.VICTORY, {});
    audio.stopMusic();
    audio.play('promotion');
    this.endVictory = true;
    this.endTimer = 1;
  }

  private finishRun(victory: boolean): void {
    const ctx = this.ctx;
    const stats: RunStats = {
      mode: this.mode,
      elapsed: ctx.runtime.elapsed,
      kills: ctx.score.kills,
      eliteKills: ctx.score.eliteKills,
      bossKills: ctx.score.bossKills,
      promotions: ctx.promotion.promotions,
      maxArmySize: ctx.score.maxArmySize,
      tierName: ctx.army.currentTier.name,
      score: ctx.score.score,
      victory,
    };

    const previousBest = save.current.bestScore;
    const isNewBest = stats.score > previousBest;

    save.update((data) => {
      data.gamesPlayed += 1;
      data.totalKills += stats.kills;
      data.tutorialCompleted = true;
      data.endlessUnlocked = true;
      if (stats.promotions > data.highestPromotion) data.highestPromotion = stats.promotions;
      if (stats.score > data.bestScore) data.bestScore = stats.score;
      if (this.mode === 'ENDLESS' && stats.score > data.bestEndlessScore) {
        data.bestEndlessScore = stats.score;
      }
    });
    void save.flush();

    // Only ever one score type is reported to YouTube.
    if (isNewBest) playables.sendScore(stats.score);
    this.hooks.finish(stats, Math.max(previousBest, stats.score), isNewBest);
  }

  resize(width: number, height: number): void {
    this.ctx.viewport.update(width, height);
  }

  destroy(): void {
    for (const off of this.unsubscribe) off();
    this.unsubscribe.length = 0;
    this.input.destroy();
    this.hud.destroy();
    this.view.destroy();
    this.ctx.effects.destroy();
    this.ctx.events.clear();
  }
}
