import Phaser from 'phaser';
import { BALANCE } from '../config/BalanceConfig';
import { COLORS, isDebugEnabled } from '../config/GameConfig';
import type { BattleContext } from '../core/BattleContext';
import { createRuntimeState } from '../core/BattleContext';
import { EventBus, GameEvent } from '../core/EventBus';
import { nextRunSeed, save } from '../core/Services';
import { Viewport } from '../core/Viewport';
import { Background } from '../render/Background';
import { ArmySystem } from '../systems/ArmySystem';
import { audio } from '../systems/AudioSystem';
import { CombatSystem } from '../systems/CombatSystem';
import { EnemyDirector } from '../systems/EnemyDirector';
import { EnemySystem } from '../systems/EnemySpawnSystem';
import { EffectsSystem } from '../systems/EffectsSystem';
import { InputSystem } from '../systems/InputSystem';
import { PromotionSystem } from '../systems/PromotionSystem';
import { QualityManager } from '../systems/QualityManager';
import { ScoreSystem } from '../systems/ScoreSystem';
import { LaneObjectSystem } from '../systems/LaneObjectSystem';
import { UpgradeSystem } from '../systems/UpgradeSystem';
import { playables } from '../systems/YouTubePlayablesAdapter';
import type { EnemyKind, GameMode, RunStats, WavePhase } from '../types/game';
import { BattleHUD } from '../ui/BattleHUD';
import { DebugOverlay } from '../ui/DebugOverlay';
import { PromotionModal } from '../ui/PromotionModal';
import { SeededRandom } from '../utils/SeededRandom';

/**
 * BattleScene is an *orchestrator*, not a god class.
 *
 * It builds the systems, forwards a fixed update order, and translates a
 * handful of high level events (promotion ready, army wiped, boss killed) into
 * scene transitions. All actual game logic lives in `src/systems`.
 */
export class BattleScene extends Phaser.Scene {
  private ctx!: BattleContext;
  private hud!: BattleHUD;
  private modal!: PromotionModal;
  private inputSystem!: InputSystem;
  private lanes!: LaneObjectSystem;
  private background!: Background;
  private uiCamera!: Phaser.Cameras.Scene2D.Camera;
  private debug?: DebugOverlay;

  private mode: GameMode = 'CAMPAIGN';
  private finalBossSpawned = false;
  private endlessBossTimer: number = BALANCE.ENDLESS_BOSS_INTERVAL;
  private endingRun = false;
  private unsubscribe: (() => void)[] = [];

  constructor() {
    super('Battle');
  }

  init(data: { mode?: GameMode }): void {
    this.mode = data?.mode ?? 'CAMPAIGN';
    this.finalBossSpawned = false;
    this.endingRun = false;
    this.endlessBossTimer = BALANCE.ENDLESS_BOSS_INTERVAL;
    this.unsubscribe = [];
  }

  create(): void {
    const { width, height } = this.scale.gameSize;

    const viewport = new Viewport();
    viewport.update(width, height);

    const worldLayer = this.add.layer();
    const uiLayer = this.add.layer();

    this.cameras.main.setBackgroundColor(COLORS.bgBottom);
    viewport.applyTo(this.cameras.main);

    // Second, unzoomed camera renders the HUD in screen space.
    this.uiCamera = this.cameras.add(0, 0, width, height);
    this.uiCamera.setScroll(0, 0);
    this.cameras.main.ignore(uiLayer);
    this.uiCamera.ignore(worldLayer);

    const events = new EventBus();
    const rng = new SeededRandom(nextRunSeed());
    const quality = new QualityManager();
    const runtime = createRuntimeState(this.mode);

    // Systems need the context in their constructors, so it is built in two
    // steps: shared services first, then the systems that depend on them.
    const ctx = {
      scene: this,
      events,
      rng,
      viewport,
      quality,
      runtime,
      worldLayer,
      uiLayer,
    } as unknown as BattleContext;

    ctx.promotion = new PromotionSystem();
    ctx.upgrades = new UpgradeSystem(rng);
    ctx.score = new ScoreSystem();
    ctx.director = new EnemyDirector(rng, {
      onPhase: (phase) => this.onPhaseChanged(phase),
      onModifier: (label) => events.emit(GameEvent.ENDLESS_MODIFIER, { label }),
    });
    ctx.effects = new EffectsSystem(this, worldLayer, viewport, quality, this.cameras.main);
    ctx.army = new ArmySystem(ctx);
    ctx.enemies = new EnemySystem(ctx);
    ctx.combat = new CombatSystem(ctx);
    ctx.laneObjects = new LaneObjectSystem(ctx);
    this.ctx = ctx;

    this.background = new Background(this, worldLayer);
    this.background.redraw(viewport);


    ctx.army.create();
    ctx.director.start(this.mode);

    this.lanes = ctx.laneObjects;
    this.lanes.create();

    this.inputSystem = new InputSystem(ctx);
    this.inputSystem.create();

    this.hud = new BattleHUD(ctx);
    this.modal = new PromotionModal(this, uiLayer);

    if (isDebugEnabled()) {
      // Machine-readable state snapshot for automated smoke tests / QA.
      (window as unknown as Record<string, unknown>).__LASTLINE_DEBUG__ = () => ({
        armyCount: ctx.army.count,
        tier: ctx.army.currentTier.name,
        tierIndex: ctx.promotion.currentTierIndex,
        tierPower: ctx.army.tierPower,
        promotions: ctx.promotion.promotions,
        elapsed: ctx.runtime.elapsed,
        zombies: ctx.enemies.activeCount,
        kills: ctx.score.kills,
        score: ctx.score.score,
        frozen: ctx.runtime.frozen,
        over: ctx.runtime.over,
        fps: ctx.quality.fps,
        quality: ctx.quality.level,
        soldierDamage: ctx.army.soldierDamage,
        fireRate: ctx.combat.currentFireRate,
        owned: ctx.upgrades.getOwned().map((o) => `${o.definition.id}:${o.level}`),
        doctrines: ctx.upgrades.modifiers.doctrineLevels,
      });

      this.debug = new DebugOverlay(ctx, {
        forcePromotion: () => this.startPromotion(true),
        spawnBoss: () => ctx.enemies.spawnBoss('BOSS_CRUSHER', 0.5),
        spawnZombies: (count) => {
          for (let i = 0; i < count; i++) ctx.enemies.spawn('WALKER', false);
        },
        addReinforcement: () => ctx.army.addSoldiers(10),
        killAll: () => ctx.enemies.clear(true),
        wipeArmy: () => ctx.army.wipe(),
      });
    }

    this.bindEvents();
    this.onResize(this.scale.gameSize);
    this.scale.on(Phaser.Scale.Events.RESIZE, this.onResize, this);

    this.unsubscribe.push(playables.onPause(() => this.pauseSimulation()));
    this.unsubscribe.push(playables.onResume(() => this.resumeSimulation()));

    audio.startMusic();
    this.showTutorial();

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.shutdownScene());
  }

  /* --------------------------------------------------------------- events -- */

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

    ctx.events.on(GameEvent.SOLDIER_ADDED, () => {
      ctx.score.trackArmySize(ctx.army.count);
    });

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
    this.time.delayedCall(7000, () => {
      if (ctx.runtime.over || ctx.runtime.frozen) return;
      ctx.events.emit(GameEvent.TUTORIAL_HINT, {
        text: 'YOU SHOOT STRAIGHT AHEAD',
        duration: 3,
      });
    });
    this.time.delayedCall(14000, () => {
      if (ctx.runtime.over || ctx.runtime.frozen) return;
      ctx.events.emit(GameEvent.TUTORIAL_HINT, {
        text: 'LEFT: BREAK SUPPLY\nRIGHT: HOLD THE HORDE',
        duration: 4,
      });
    });
  }

  /* --------------------------------------------------------------- update -- */

  override update(_time: number, delta: number): void {
    const ctx = this.ctx;
    if (!ctx) return;

    // Clamp: a long stall (tab switch, GC) must never fast-forward the sim.
    const frameDt = Math.min(delta / 1000, 0.05);

    if (ctx.quality.update(frameDt)) this.applyQuality();
    if (ctx.runtime.paused) return;

    const dt = frameDt * ctx.runtime.timeScale;

    if (!ctx.runtime.frozen && dt > 0) {
      if (!ctx.runtime.over) ctx.runtime.elapsed += dt;

      this.inputSystem.update(dt);
      ctx.army.update(dt);
      ctx.enemies.update(dt);
      this.lanes.update(dt);
      ctx.combat.update(dt);

      ctx.score.setElapsed(ctx.runtime.elapsed);
      ctx.score.setPromotions(ctx.promotion.promotions);

      this.checkPromotion();
      this.checkEndlessBoss(dt);
    }

    // The deck keeps scrolling even while frozen, so the world never looks dead.
    this.background.update(ctx.runtime.frozen ? frameDt * 0.15 : dt);
    ctx.effects.update(frameDt);
    audio.update(frameDt);
    this.hud.update(frameDt);
    this.debug?.update(frameDt);
  }

  private applyQuality(): void {
    // Quality only affects visuals; the simulation is untouched by design.
    this.background.redraw(this.ctx.viewport);
  }

  /* ------------------------------------------------------------ promotion -- */

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
  private startPromotion(forced: boolean): void {
    const ctx = this.ctx;
    if (ctx.runtime.frozen || ctx.runtime.over) return;
    if (forced && ctx.army.count < 2) return;

    ctx.runtime.frozen = true;
    ctx.runtime.timeScale = BALANCE.PROMOTION_SLOWMO;
    ctx.events.emit(GameEvent.PROMOTION_READY, {
      promotionIndex: ctx.promotion.promotions + 1,
    });

    const draft = ctx.upgrades.generateChoices(ctx.promotion.promotions + 1);

    this.time.delayedCall(BALANCE.PROMOTION_FREEZE_TIME * 1000, () => {
      ctx.runtime.timeScale = 0;
      this.modal.open(draft.choices, (definition) => {
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

        this.modal.showTierBanner(result.toTier.name);
        ctx.effects.shake(0.008, 0.25);
        ctx.events.emit(GameEvent.PROMOTION_COMPLETE, {
          tierName: result.toTier.name,
          count: result.toCount,
        });

        ctx.runtime.frozen = false;
        ctx.runtime.timeScale = 1;
      });
    });
  }

  /* ---------------------------------------------------------------- bosses -- */

  private checkEndlessBoss(dt: number): void {
    if (this.mode !== 'ENDLESS') return;
    const ctx = this.ctx;
    this.endlessBossTimer -= dt;
    if (this.endlessBossTimer > 0 || ctx.runtime.bossActive) return;

    this.endlessBossTimer = BALANCE.ENDLESS_BOSS_INTERVAL;
    const kind: EnemyKind =
      ctx.rng.bool(0.5) ? 'BOSS_CRUSHER' : 'BOSS_ABOMINATION';
    // Endless bosses keep pace with the run's HP scaling.
    const scale = 0.7 + ctx.runtime.elapsed / 260;
    ctx.enemies.spawnBoss(kind, scale);
  }

  /* -------------------------------------------------------------- run end -- */

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

    this.time.delayedCall(BALANCE.GAME_OVER_SLOWMO_TIME * 1000, () => this.finishRun(false));
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

    this.time.delayedCall(1000, () => this.finishRun(true));
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

    this.scene.start('GameOver', {
      stats,
      bestScore: Math.max(previousBest, stats.score),
      isNewBest,
    });
  }

  /* ------------------------------------------------------ pause / resize -- */

  private pauseSimulation(): void {
    if (!this.ctx || this.ctx.runtime.paused) return;
    this.ctx.runtime.paused = true;
    this.tweens.pauseAll();
    this.time.paused = true;
    audio.pause();
  }

  private resumeSimulation(): void {
    if (!this.ctx || !this.ctx.runtime.paused) return;
    this.ctx.runtime.paused = false;
    this.tweens.resumeAll();
    this.time.paused = false;
    audio.resume();
  }

  private onResize(gameSize: Phaser.Structs.Size): void {
    if (!this.ctx) return;
    const width = gameSize.width;
    const height = gameSize.height;

    // Resizing recomputes layout only - the run keeps running.
    this.ctx.viewport.update(width, height);
    this.ctx.viewport.applyTo(this.cameras.main);
    this.uiCamera.setSize(width, height);
    this.uiCamera.setScroll(0, 0);

    this.background.redraw(this.ctx.viewport);
    this.lanes.resize();
    this.hud.resize(width, height);
    this.modal.resize(width, height);
    this.debug?.resize(width, height);
  }

  private shutdownScene(): void {
    this.scale.off(Phaser.Scale.Events.RESIZE, this.onResize, this);
    for (const off of this.unsubscribe) off();
    this.unsubscribe = [];
    this.inputSystem?.destroy();
    this.background?.destroy();
    this.modal?.destroy();
    this.ctx?.effects.destroy();
    this.ctx?.events.clear();
    audio.setGunfireIntensity(0, 1);
    audio.stopMusic();
  }
}
