import { save } from '../core/Services';
import { Stage } from '../render3d/Stage';
import { audio } from '../systems/AudioSystem';
import { playables } from '../systems/YouTubePlayablesAdapter';
import type { GameMode, RunStats, UpgradeDefinition } from '../types/game';
import { DraftScreen, MenuScreen, SummaryScreen } from '../ui/Screens';
import { BattleRun } from './BattleRun';

/**
 * Owns the canvas, the render stage and whichever screen is up.
 *
 * There is no engine underneath any more: one requestAnimationFrame loop, one
 * WebGL renderer, and DOM for everything that is text. That is also why the
 * bundle got smaller rather than larger when the game went 3D.
 */
export class App {
  private readonly stage: Stage;
  private readonly canvas: HTMLCanvasElement;
  private readonly overlay: HTMLElement;
  private readonly worldLabels: HTMLElement;
  private readonly menu: MenuScreen;
  private readonly draft: DraftScreen;
  private readonly summary: SummaryScreen;

  private run: BattleRun | null = null;
  private last = 0;
  private started = false;

  constructor(root: HTMLElement) {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'game-canvas';
    root.appendChild(this.canvas);

    this.worldLabels = document.createElement('div');
    this.worldLabels.className = 'world-labels';
    root.appendChild(this.worldLabels);

    this.overlay = document.createElement('div');
    this.overlay.className = 'overlay';
    root.appendChild(this.overlay);

    this.stage = new Stage(this.canvas);

    this.menu = new MenuScreen(
      this.overlay,
      { onPlay: (endless) => this.startRun(endless ? 'ENDLESS' : 'CAMPAIGN') },
      {
        score: save.current.bestScore,
        endless: save.current.bestEndlessScore,
        endlessUnlocked: save.current.endlessUnlocked,
      },
    );
    this.draft = new DraftScreen(this.overlay);
    this.summary = new SummaryScreen(this.overlay, {
      onRetry: () => this.startRun(this.lastMode),
      onMenu: () => this.showMenu(),
    });

    window.addEventListener('resize', () => this.resize());
    window.addEventListener('orientationchange', () => this.resize());
    this.resize();
    this.menu.show();

    // First interaction unlocks WebAudio on every mobile browser.
    const unlock = () => audio.resume();
    window.addEventListener('pointerdown', unlock, { once: true });
  }

  private lastMode: GameMode = 'CAMPAIGN';

  private resize(): void {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.stage.resize(width, height);
    this.run?.resize(width, height);
  }

  private showMenu(): void {
    this.run?.destroy();
    this.run = null;
    this.menu.show();
  }

  private startRun(mode: GameMode): void {
    this.lastMode = mode;
    this.menu.hide();
    this.summary.hide();
    this.run?.destroy();
    this.run = new BattleRun(mode, this.stage, this.canvas, this.overlay, this.worldLabels, {
      openDraft: (choices: UpgradeDefinition[], choose) => this.draft.open(choices, choose),
      finish: (stats: RunStats, best, isNewBest) => this.summary.open(stats, best, isNewBest),
    });
    this.resize();
    audio.resume();
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    this.last = performance.now();
    const frame = (now: number): void => {
      // Clamp: a long stall (tab switch, GC) must never fast-forward the sim.
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      this.run?.update(dt);
      this.stage.render();
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
    playables.firstFrameReady();
    playables.gameReady();
  }

  /** Debug/QA handle. */
  get debug(): { stage: Stage; run: BattleRun | null } {
    return { stage: this.stage, run: this.run };
  }
}
