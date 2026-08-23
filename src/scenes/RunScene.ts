import { Scene } from '@babylonjs/core/scene';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { GameScene } from './GameScene';
import type { RunResult, SceneId } from '../core/Types';
import { RunCamera } from './playfield/RunCamera';
import { TrackScenery } from './playfield/TrackScenery';
import { CrowdRenderer } from './playfield/CrowdRenderer';
import { GateRenderer } from './playfield/GateRenderer';
import { RunKinematics } from '../run/RunKinematics';
import { GateSystem } from '../run/GateSystem';
import { ArmyManager } from '../army/ArmyManager';
import { FormationLayout } from '../army/FormationSystem';
import { HUD } from '../ui/HUD';
import { DebugOverlay } from '../ui/DebugOverlay';
import { UiLayer, button } from '../ui/dom';
import { ARMY, RENDER, RUN } from '../config/gameBalance';
import { createSeed } from '../util/Random';
import { clamp } from '../util/math';
import { IS_DEV } from '../core/Config';

/**
 * Startstärke einer Runde.
 *
 * Mit aktivem Debug-Modus lässt sie sich per `?debug=1&power=5000` setzen.
 * Ohne den Schalter gibt es keinen Weg dorthin — das ist eine QA-Hilfe, um
 * späte Spielzustände (Beförderung, später Bosse) erreichbar zu machen,
 * ohne jedes Mal Minuten zu fahren.
 */
function startingPower(): number {
  if (!DebugOverlay.isEnabled(IS_DEV)) return ARMY.startCombatPower;
  const raw = new URLSearchParams(window.location.search).get('power');
  const parsed = raw === null ? Number.NaN : Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : ARMY.startCombatPower;
}

/**
 * Die Run-Szene.
 *
 * PHASE 2 — Armee, Formation und Gates stehen: die Truppe wächst und
 * schrumpft durch Torentscheidungen, wird als Thin-Instance-Crowd gezeichnet
 * und die Runde endet, wenn nichts mehr übrig ist.
 *
 * Noch offen und hier anzuknüpfen:
 *   update()   → Gegner, Kampf (Phase 4); RunDirector statt fester
 *                Distanzschwelle für Sektoren (Phase 5)
 *   Checkpoint → Promotion in das nächste Tier (Phase 3)
 */
export class RunScene extends GameScene {
  readonly id: SceneId = 'run';

  private camera: RunCamera | null = null;
  private scenery: TrackScenery | null = null;
  private crowd: CrowdRenderer | null = null;
  private gateRenderer: GateRenderer | null = null;
  private hud: HUD | null = null;
  private debug: DebugOverlay | null = null;

  private readonly kinematics = new RunKinematics();
  private readonly formation = new FormationLayout();
  private army!: ArmyManager;
  private gates!: GateSystem;

  private elapsed = 0;
  private sectorIndex = 0;
  private finished = false;

  enter(): void {
    const scene = new Scene(this.ctx.engine);
    scene.clearColor = new Color4(0.05, 0.07, 0.09, 1);
    // Weniger Arbeit pro Frame: es gibt in dieser Szene nichts anzuklicken.
    scene.skipPointerMovePicking = true;
    scene.fogMode = Scene.FOGMODE_LINEAR;
    scene.fogStart = RENDER.fogStart;
    scene.fogEnd = RENDER.fogEnd;
    scene.fogColor = new Color3(0.05, 0.07, 0.09);
    this.babylonScene = scene;

    const ambient = new HemisphericLight('ambient', new Vector3(0, 1, 0), scene);
    ambient.intensity = 0.72;
    ambient.diffuse = new Color3(0.75, 0.82, 1);
    ambient.groundColor = new Color3(0.16, 0.14, 0.12);

    const sun = new DirectionalLight('sun', new Vector3(-0.4, -1, 0.55), scene);
    sun.intensity = 1.1;
    sun.diffuse = new Color3(1, 0.94, 0.82);

    this.camera = new RunCamera(scene);
    this.scenery = new TrackScenery(scene);
    this.crowd = new CrowdRenderer(scene);
    this.gateRenderer = new GateRenderer(scene);

    const seed = createSeed();
    this.army = new ArmyManager(this.ctx.bus, startingPower());
    this.gates = new GateSystem(seed);
    this.kinematics.reset();
    this.elapsed = 0;
    this.sectorIndex = 0;
    this.finished = false;
    this.camera.snapTo(0, 0);

    this.ctx.input.reset();
    this.ctx.input.attach();
    this.onExit(() => this.ctx.input.detach());

    // Die Aufraeumer halten bewusst LOKALE Referenzen, keine Felder: wuerde
    // exit() ein Feld vor dem Aufraeumen nullen, liefe der Closure ins Leere
    // und das UI bliebe im DOM stehen.
    const hud = new HUD(this.ctx.uiRoot);
    this.hud = hud;
    this.onExit(() => hud.dispose());

    if (DebugOverlay.isEnabled(IS_DEV)) {
      const debug = new DebugOverlay(this.ctx.uiRoot);
      this.debug = debug;
      this.onExit(() => debug.dispose());
    }

    // Vorläufiger Abbruchknopf, bis Sektoren ein echtes Rundenende setzen.
    const controls = new UiLayer(this.ctx.uiRoot, 'run-controls');
    controls.add(button('End run', () => this.finishRun(false), 'ghost'));
    this.onExit(() => controls.dispose());

    this.ctx.bus.emit('run:started', { mode: this.ctx.state.mode, seed });
  }

  override update(dt: number): void {
    if (this.finished) return;

    this.elapsed += dt;
    // Formation vor der Bewegung aktualisieren: ihre Breite begrenzt, wie
    // weit der Anker an den Fahrbahnrand darf.
    this.formation.update(this.army.displayCount);
    this.kinematics.update(this.ctx.input.lateral, dt, this.formation.halfWidth);
    this.scenery?.update(this.kinematics.distance);
    this.camera?.follow(this.kinematics.x, this.kinematics.distance, dt, this.formation.depth);

    this.gates.update(this.kinematics.distance, this.kinematics.x, (effect) =>
      this.army.applyGate(effect),
    );

    const sector = Math.floor(this.kinematics.distance / RUN.sectorLengthMeters);
    if (sector !== this.sectorIndex) {
      this.sectorIndex = sector;
      this.reachCheckpoint();
    }

    if (this.army.defeated) {
      this.finishRun(false);
      return;
    }

    this.ctx.bus.emit('run:distance', { meters: this.kinematics.distance });
  }

  /**
   * Sektorgrenze als vorläufiger Kontrollpunkt.
   *
   * Hier — und nur hier — wird befördert. Eine Beförderung mitten im
   * Vorbeifahren an einem Tor liesse sich nicht inszenieren; sie braucht
   * einen Moment, in dem der Spieler nichts anderes zu tun hat.
   * Ab Phase 5 setzt der RunDirector diese Punkte bewusst statt alle 220 m.
   */
  private reachCheckpoint(): void {
    const steps = this.army.tryPromote();
    if (steps > 0) {
      this.hud?.showPromotion(this.army.tierName, this.elapsed);
    }
  }

  override beforeRender(_alpha: number): void {
    const army = this.army.current;

    this.crowd?.update(
      this.formation,
      army.displayCount,
      army.tierIndex,
      this.kinematics.x,
      this.kinematics.distance,
      this.kinematics.lateralVelocity,
      this.elapsed,
    );
    this.gateRenderer?.sync(this.gates.active, this.kinematics.distance);

    const progress = clamp(
      (this.kinematics.distance % RUN.sectorLengthMeters) / RUN.sectorLengthMeters,
      0,
      1,
    );
    this.hud?.render({
      tierName: this.army.tierName,
      unitCount: army.unitCount,
      combatPower: army.combatPower,
      overflow: army.overflowProgress,
      sectorProgress: progress,
      sectorIndex: this.sectorIndex,
      elapsedSeconds: this.elapsed,
    });

    this.debug?.update(this.ctx.engine, this.babylonScene);
  }

  override resize(): void {
    this.camera?.applyFov();
  }

  override exit(): void {
    // Renderer zuerst: sie geben Texturen und Material-Caches frei, die die
    // Babylon-Szene allein nicht kennt.
    this.scenery?.dispose();
    this.crowd?.dispose();
    this.gateRenderer?.dispose();
    // Dann die in enter() registrierten Aufraeumer und die Szene selbst …
    super.exit();
    // … und erst danach die Felder leeren.
    this.scenery = null;
    this.crowd = null;
    this.gateRenderer = null;
    this.camera = null;
    this.hud = null;
    this.debug = null;
  }

  /** Ab Phase 5 liefert der RunDirector das Ergebnis; bis dahin von Hand. */
  private finishRun(victory: boolean): void {
    if (this.finished) return;
    this.finished = true;

    const result: RunResult = {
      mode: this.ctx.state.mode,
      victory,
      score: Math.round(this.kinematics.distance * 10 + this.army.peakCombatPower * 5),
      stats: {
        sectorsCleared: this.sectorIndex,
        kills: 0,
        bossesKilled: 0,
        peakTierIndex: this.army.peakTierIndex,
        peakCombatPower: this.army.peakCombatPower,
        coinsEarned: 0,
        durationSeconds: this.elapsed,
      },
    };
    this.ctx.state.lastResult = result;
    this.ctx.bus.emit('run:ended', result);
    this.ctx.requestScene('results');
  }
}
