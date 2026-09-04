import {
  QUALITY_CONFIG,
  QUALITY_PRESETS,
  type QualityLevel,
  type QualitySettings,
} from '../config/GameConfig';

const LEVELS: QualityLevel[] = ['HIGH', 'MEDIUM', 'LOW'];

/**
 * Watches the frame rate and degrades *visual* fidelity only.
 *
 * Explicitly never touches simulation values (spawn rate, damage, HP), so a
 * weaker device gets a smoother picture but exactly the same game.
 */
export class QualityManager {
  private levelIndex = 0;
  private lowTimer = 0;
  private highTimer = 0;
  private smoothedFps = 60;

  get level(): QualityLevel {
    return LEVELS[this.levelIndex];
  }

  get settings(): QualitySettings {
    return QUALITY_PRESETS[this.level];
  }

  get fps(): number {
    return this.smoothedFps;
  }

  update(dt: number): boolean {
    if (dt <= 0) return false;
    const instant = 1 / dt;
    // Heavy smoothing: a single hitching frame must not drop quality.
    this.smoothedFps += (instant - this.smoothedFps) * Math.min(1, dt * 2.5);

    let changed = false;

    if (this.smoothedFps < QUALITY_CONFIG.degradeBelowFps) {
      this.lowTimer += dt;
      this.highTimer = 0;
      if (this.lowTimer >= QUALITY_CONFIG.degradeAfterSeconds && this.levelIndex < 2) {
        this.levelIndex++;
        this.lowTimer = 0;
        changed = true;
      }
    } else if (this.smoothedFps > QUALITY_CONFIG.recoverAboveFps) {
      this.highTimer += dt;
      this.lowTimer = 0;
      if (this.highTimer >= QUALITY_CONFIG.recoverAfterSeconds && this.levelIndex > 0) {
        this.levelIndex--;
        this.highTimer = 0;
        changed = true;
      }
    } else {
      this.lowTimer = Math.max(0, this.lowTimer - dt * 0.5);
      this.highTimer = Math.max(0, this.highTimer - dt * 0.5);
    }

    return changed;
  }

  /** Manual override for the debug overlay. */
  setLevel(level: QualityLevel): void {
    this.levelIndex = LEVELS.indexOf(level);
    if (this.levelIndex < 0) this.levelIndex = 0;
  }

  reset(): void {
    this.levelIndex = 0;
    this.lowTimer = 0;
    this.highTimer = 0;
    this.smoothedFps = 60;
  }
}
