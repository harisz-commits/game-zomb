import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { Scene } from '@babylonjs/core/scene';
import { bossDeathProgress, type BossState } from '../../enemies/BossManager';

/**
 * Zeichnet den Boss.
 *
 * Ein einzelnes Mesh, das je nach Boss umgefärbt und skaliert wird — es gibt
 * nie zwei gleichzeitig. Beim Angriff staucht er sich kurz zusammen und
 * federt zurück: Ohne diese Vorwarnung träfe der Schlag aus dem Nichts, und
 * ein Treffer, den man nicht kommen sieht, fühlt sich unfair an.
 */
export class BossRenderer {
  private readonly mesh: Mesh;
  private readonly material: StandardMaterial;
  private currentId = '';
  /** Läuft von 1 auf 0 nach einem Angriff und treibt das Zurückfedern. */
  private impact = 0;

  constructor(scene: Scene) {
    this.material = new StandardMaterial('boss-mat', scene);
    this.material.specularColor = Color3.Black();

    this.mesh = MeshBuilder.CreateBox('boss', { width: 1, height: 1.5, depth: 0.9 }, scene);
    this.mesh.material = this.material;
    this.mesh.isPickable = false;
    this.mesh.doNotSyncBoundingInfo = true;
    this.mesh.setEnabled(false);
  }

  /** Meldet einen Angriff, damit die Figur sichtbar ausholt. */
  punch(): void {
    this.impact = 1;
  }

  update(boss: BossState | null, dt: number, time: number): void {
    if (!boss) {
      this.mesh.setEnabled(false);
      this.currentId = '';
      return;
    }

    if (boss.spec.id !== this.currentId) {
      this.currentId = boss.spec.id;
      const [r, g, b] = boss.spec.visual.color;
      this.material.diffuseColor = new Color3(r, g, b);
      this.material.emissiveColor = new Color3(r * 0.2, g * 0.2, b * 0.2);
    }

    this.impact = Math.max(0, this.impact - dt * 2.6);
    const dying = bossDeathProgress(boss);
    const base = boss.spec.visual.scale;

    this.mesh.setEnabled(true);
    // Beim Ausholen kurz breiter und flacher, dann zurück.
    this.mesh.scaling.set(
      base * (1 + this.impact * 0.16) * (1 - dying * 0.3),
      base * (1 - this.impact * 0.2) * (1 - dying * 0.8),
      base * (1 + this.impact * 0.16) * (1 - dying * 0.3),
    );
    this.mesh.position.set(
      boss.x + Math.sin(time * 1.6) * 0.35,
      (this.mesh.scaling.y * 1.5) / 2,
      boss.z,
    );
    this.mesh.rotation.z = dying * 1.5;
  }

  dispose(): void {
    this.mesh.dispose(false, true);
  }
}
