import { Scene } from '@babylonjs/core/scene';
import { TargetCamera } from '@babylonjs/core/Cameras/targetCamera';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Color4 } from '@babylonjs/core/Maths/math.color';
import { GameScene } from './GameScene';
import type { SceneId } from '../core/Types';
import { createResultsScreen } from '../ui/ResultsScreen';
import { bankRunResult } from '../progression/RewardSystem';
import { AdManager } from '../ads/AdManager';
import { REWARD_IDS } from '../config/ads';

/**
 * Rundenabschluss.
 *
 * Phase 1 zeigt die Zusammenfassung und schreibt Statistik/Score in den
 * Spielstand. Belohnungen, Rewarded-Ad-Verdopplung und Interstitials
 * folgen in Phase 6 bzw. 8 — die Stellen sind im Code markiert.
 */
export class ResultsScene extends GameScene {
  readonly id: SceneId = 'results';

  enter(): void {
    const scene = new Scene(this.ctx.engine);
    scene.clearColor = new Color4(0.04, 0.05, 0.07, 1);
    scene.skipPointerMovePicking = true;
    const camera = new TargetCamera('results-camera', new Vector3(0, 0, -10), scene);
    camera.setTarget(Vector3.Zero());
    scene.activeCamera = camera;
    this.babylonScene = scene;

    const result = this.ctx.state.lastResult;
    if (!result) {
      this.ctx.platform.logWarning('results scene without a result — back to menu');
      this.ctx.requestScene('menu');
      return;
    }

    // Genau EINMAL verbuchen. Die Szene kann bei einem Wiedereintritt
    // erneut aufgebaut werden; ein zweites Gutschreiben wäre Falschgeld.
    const rewards = bankRunResult(this.ctx.save.current, result);
    result.stats.coinsEarned = rewards.coins;
    this.ctx.save.markDirty();
    void this.ctx.save.flush();
    // Zertifizierungsanforderung: Der gesendete Bestwert MUSS dem Bestwert
    // im Spielstand entsprechen. Vorher ging der Score DIESER Runde raus —
    // nach einem schwächeren Lauf hätte YouTube einen niedrigeren Wert
    // gesehen als das Spiel selbst anzeigt.
    void this.ctx.platform.sendScore(this.ctx.save.current.stats.bestScore);
    // Verhindert, dass ein zweiter Aufbau derselben Runde nochmals bucht.
    this.ctx.state.lastResult = null;

    const ads = new AdManager(this.ctx.platform);
    const screen = createResultsScreen(this.ctx.uiRoot, {
      result,
      techParts: rewards.techParts,
      newBestDepth: rewards.newBestDepth,
      onDoubleRewards: async () => {
        const granted = await ads.offerReward(REWARD_IDS.doubleRewards);
        if (!granted) return false;
        // Noch einmal dieselbe Summe — die erste ist bereits gutgeschrieben.
        this.ctx.save.update((save) => {
          save.meta.coins += rewards.coins;
          save.meta.techParts += rewards.techParts;
        });
        result.stats.coinsEarned = rewards.coins * 2;
        void this.ctx.save.flush();
        return true;
      },
      onContinue: () => {
        // Das Interstitial gehört hierher: zwischen zwei Runden, an einer
        // Pause, die der Spieler selbst gewählt hat. Der Szenenwechsel
        // wartet nicht darauf — eine hängende Einblendung darf das Spiel
        // nicht festhalten.
        void ads.maybeShowInterstitial(this.ctx.save.current, performance.now() / 1000);
        this.ctx.requestScene('menu');
      },
      onRetry: () => this.ctx.requestScene('run'),
    });
    this.onExit(() => screen.dispose());
  }
}
