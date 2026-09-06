import * as THREE from 'three';
import { modelMaterial } from './BoxModel';
import { sceneX, sceneZ } from './Stage';

/**
 * Draws up to `capacity` copies of one character.
 *
 * Three InstancedMeshes - body, left leg, right leg - so the whole horde is
 * three draw calls no matter how many of them there are, and the legs can
 * still swing about the hip. That split is the entire animation system: a
 * crowd at this camera distance needs a stride and a bob, not a skeleton.
 */
export class ActorPool {
  private readonly body: THREE.InstancedMesh;
  private readonly legs: THREE.InstancedMesh[];
  private readonly dummy = new THREE.Object3D();
  private readonly colour = new THREE.Color();
  private used = 0;

  constructor(
    scene: THREE.Scene,
    bodyGeometry: THREE.BufferGeometry,
    legGeometry: THREE.BufferGeometry,
    private readonly hipY: number,
    private readonly legX: number,
    readonly capacity: number,
  ) {
    const material = modelMaterial();
    this.body = new THREE.InstancedMesh(bodyGeometry, material, capacity);
    this.body.castShadow = true;
    this.body.frustumCulled = false;
    this.body.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(this.body);

    this.legs = [-1, 1].map(() => {
      const mesh = new THREE.InstancedMesh(legGeometry, material, capacity);
      mesh.castShadow = true;
      mesh.frustumCulled = false;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      scene.add(mesh);
      return mesh;
    });

    // Nothing is drawn until `place` is called: `count` is the live number of
    // actors, not the capacity. Leaving it at capacity and hiding spare slots
    // with a zero-scale matrix still submits their triangles - that mistake
    // alone cost half a million triangles a frame.
    this.body.count = 0;
    this.legs[0].count = 0;
    this.legs[1].count = 0;
  }

  /** Starts a frame. Every actor still alive must be `place`d after this. */
  begin(): void {
    this.used = 0;
  }

  /**
   * Places one actor. `stride` drives the walk cycle; pass a constant for
   * something standing still.
   */
  place(
    worldX: number,
    worldY: number,
    scale: number,
    stride: number,
    yaw: number,
    lift = 0,
  ): number {
    const index = this.used;
    if (index >= this.capacity) return -1;
    this.used++;

    const x = sceneX(worldX);
    const z = sceneZ(worldY);
    const swing = Math.sin(stride) * 0.45;
    const bounce = Math.abs(Math.sin(stride)) * 0.35 * scale;

    this.dummy.position.set(x, lift + bounce, z);
    this.dummy.rotation.set(0, yaw, 0);
    this.dummy.scale.setScalar(scale);
    this.dummy.updateMatrix();
    this.body.setMatrixAt(index, this.dummy.matrix);

    for (let side = 0; side < 2; side++) {
      const sign = side === 0 ? -1 : 1;
      const offsetX = sign * this.legX * scale;
      this.dummy.position.set(
        x + Math.cos(yaw) * offsetX,
        lift + bounce + this.hipY * scale,
        z - Math.sin(yaw) * offsetX,
      );
      this.dummy.rotation.set(sign * swing, yaw, 0, 'YXZ');
      this.dummy.scale.setScalar(scale);
      this.dummy.updateMatrix();
      this.legs[side].setMatrixAt(index, this.dummy.matrix);
    }
    return index;
  }

  /**
   * Multiplies an actor's baked colours. Values above 1 brighten, which is how
   * a hit flash works without a second material.
   */
  tint(index: number, r: number, g: number, b: number): void {
    if (index < 0) return;
    this.colour.r = r;
    this.colour.g = g;
    this.colour.b = b;
    this.body.setColorAt(index, this.colour);
    this.legs[0].setColorAt(index, this.colour);
    this.legs[1].setColorAt(index, this.colour);
  }

  /** Ends the frame: trims the instance count and uploads the changes. */
  end(): void {
    this.body.count = this.used;
    this.legs[0].count = this.used;
    this.legs[1].count = this.used;
    this.body.instanceMatrix.needsUpdate = true;
    this.legs[0].instanceMatrix.needsUpdate = true;
    this.legs[1].instanceMatrix.needsUpdate = true;
    if (this.body.instanceColor) {
      this.body.instanceColor.needsUpdate = true;
      if (this.legs[0].instanceColor) this.legs[0].instanceColor.needsUpdate = true;
      if (this.legs[1].instanceColor) this.legs[1].instanceColor.needsUpdate = true;
    }
  }

  setVisible(visible: boolean): void {
    this.body.visible = visible;
    this.legs[0].visible = visible;
    this.legs[1].visible = visible;
  }

  dispose(): void {
    this.body.geometry.dispose();
    this.legs[0].geometry.dispose();
    this.body.material instanceof THREE.Material && this.body.material.dispose();
    this.body.removeFromParent();
    this.legs.forEach((l) => l.removeFromParent());
  }
}
