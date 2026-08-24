import { Scene } from '@babylonjs/core/scene';
import { TargetCamera } from '@babylonjs/core/Cameras/targetCamera';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Color4 } from '@babylonjs/core/Maths/math.color';
import { GameScene } from './GameScene';
import type { GameMode, SceneId } from '../core/Types';
import { createMainMenu } from '../ui/Menus';
import { UpgradeShop } from '../ui/UpgradeShop';
import { buyUpgrade } from '../progression/MetaProgression';
import { UNLOCKS } from '../config/metaUpgrades';

/**
 * Hauptmenue: Moduswahl und Waehrungsanzeige.
 *
 * Der 3D-Hintergrund ist hier absichtlich leer — eine Menuekulisse kostet
 * Ladezeit und Draw Calls, ohne bis Phase 9 etwas beizutragen.
 */
export class MenuScene extends GameScene {
  readonly id: SceneId = 'menu';

  private menu: { dispose: () => void } | null = null;
  private shop: UpgradeShop | null = null;

  enter(): void {
    const scene = new Scene(this.ctx.engine);
    scene.clearColor = new Color4(0.04, 0.05, 0.07, 1);
    scene.skipPointerMovePicking = true;
    const camera = new TargetCamera('menu-camera', new Vector3(0, 0, -10), scene);
    camera.setTarget(Vector3.Zero());
    scene.activeCamera = camera;
    this.babylonScene = scene;

    this.showMenu();
    this.onExit(() => {
      this.menu?.dispose();
      this.shop?.dispose();
    });
  }

  private showMenu(): void {
    this.shop?.dispose();
    this.shop = null;

    const save = this.ctx.state.requireSave();
    const unlocked = new Set<GameMode>(['campaign', 'survival']);
    if (save.unlocks.includes(UNLOCKS.endless)) unlocked.add('endless');

    this.menu?.dispose();
    this.menu = createMainMenu(this.ctx.uiRoot, {
      coins: save.meta.coins,
      techParts: save.meta.techParts,
      bestScore: save.stats.bestScore,
      unlocked,
      onPlay: (mode) => {
        this.ctx.state.mode = mode;
        this.ctx.requestScene('run');
      },
      onUpgrades: () => this.showShop(),
    });
  }

  private showShop(): void {
    this.menu?.dispose();
    this.menu = null;

    this.shop = new UpgradeShop(this.ctx.uiRoot, {
      save: this.ctx.state.requireSave(),
      onBuy: (id) => {
        const bought = buyUpgrade(this.ctx.state.requireSave(), id);
        // Sofort sichern: Wer nach einem Kauf die Seite schliesst, darf
        // seine Münzen nicht verlieren.
        if (bought) void this.ctx.save.flush();
        return bought;
      },
      onClose: () => this.showMenu(),
    });
  }
}
