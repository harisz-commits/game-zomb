import { TargetCamera } from '@babylonjs/core/Cameras/targetCamera';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { Scene } from '@babylonjs/core/scene';
import { CAMERA } from '../../config/gameBalance';
import { damp } from '../../util/math';

/**
 * Verfolgerkamera: erhoeht, leicht hinter der Armee, Blick nach vorne.
 *
 * Sie folgt der Lateralbewegung nur teilweise (`lateralFollow`). Wuerde sie
 * exakt mitgehen, waere die Steuerung optisch kaum wahrnehmbar — der
 * Bildinhalt bliebe ja gleich. Der Teilversatz macht Lenken sichtbar und
 * haelt die Fahrbahnraender trotzdem im Bild.
 *
 * Das Sichtfeld wechselt zwischen Portrait und Landscape, damit in beiden
 * Formaten dieselbe Fahrbahnbreite lesbar bleibt (Portrait-first).
 */
export class RunCamera {
  readonly camera: TargetCamera;
  private readonly target = new Vector3(0, 0, 0);
  private distance: number = CAMERA.distance;

  constructor(scene: Scene) {
    this.camera = new TargetCamera(
      'run-camera',
      new Vector3(0, CAMERA.height, -CAMERA.distance),
      scene,
    );
    this.camera.minZ = 0.5;
    this.camera.maxZ = 400;
    this.applyFov();
    scene.activeCamera = this.camera;
  }

  /** Setzt die Kamera ohne Nachlauf — beim Start einer Runde. */
  snapTo(x: number, z: number): void {
    this.distance = CAMERA.distance;
    this.camera.position.set(x * CAMERA.lateralFollow, CAMERA.height, z - CAMERA.distance);
    this.updateTarget(x, z);
  }

  /**
   * @param formationDepth Länge der Truppe in Metern. Die Kamera weicht
   *   zurück, wenn die Armee wächst — sonst stehen die hinteren Reihen
   *   irgendwann vor der Linse und verdecken die Strecke. Der Rückzug ist
   *   geglättet, damit er sich als Machtgefühl liest und nicht als Ruckeln.
   */
  follow(x: number, z: number, dt: number, formationDepth = 0): void {
    const desiredX = x * CAMERA.lateralFollow;
    this.camera.position.x = damp(this.camera.position.x, desiredX, CAMERA.smoothing, dt);

    const desiredDistance = CAMERA.distance + formationDepth * CAMERA.depthPullback;
    this.distance = damp(this.distance, desiredDistance, CAMERA.distanceSmoothing, dt);

    // In Z gibt es keinen Nachlauf: die Armee darf der Kamera niemals
    // davonlaufen, sonst verliert der Spieler den Bezugspunkt.
    this.camera.position.z = z - this.distance;
    this.camera.position.y = CAMERA.height + formationDepth * CAMERA.depthLift;
    this.updateTarget(x, z);
  }

  applyFov(): void {
    const portrait = window.innerHeight >= window.innerWidth;
    this.camera.fov = portrait ? CAMERA.fovPortrait : CAMERA.fovLandscape;
  }

  private updateTarget(x: number, z: number): void {
    this.target.set(x * CAMERA.lateralFollow, 0, z + CAMERA.lookAhead);
    this.camera.setTarget(this.target);
  }
}
