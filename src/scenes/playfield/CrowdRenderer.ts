import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Matrix, Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { Scene } from '@babylonjs/core/scene';
// Side-Effect-Import: aktiviert die Thin-Instance-Methoden auf Mesh.
import '@babylonjs/core/Meshes/thinInstanceMesh';
import { DISPLAY_CAPS } from '../../config/gameBalance';
import { getTier } from '../../config/unitTiers';
import type { FormationLayout } from '../../army/FormationSystem';
import { clamp } from '../../util/math';

const FLOATS_PER_MATRIX = 16;

/**
 * Zeichnet die Armee.
 *
 * Thin Instances statt einzelner Meshes: die gesamte Truppe ist EIN Draw Call,
 * unabhängig davon, ob 6 oder 140 Soldaten stehen. Das ist die Grundlage, auf
 * der später die Horde dazukommt (PLAN.md R1) — mit echten Meshes wäre bei
 * dieser Größenordnung Schluss.
 *
 * Der Puffer wird einmal auf die Obergrenze angelegt und danach nur noch
 * beschrieben; pro Frame entsteht keine Allokation.
 */
export class CrowdRenderer {
  private readonly master: Mesh;
  private readonly material: StandardMaterial;
  private readonly matrices: Float32Array;
  private readonly matrix = Matrix.Identity();
  private readonly position = Vector3.Zero();
  private readonly scaling = Vector3.One();
  private readonly rotation = Quaternion.Identity();
  private renderedCount = 0;
  private tilt = 0;
  private tierIndex = -1;

  constructor(scene: Scene) {
    this.material = new StandardMaterial('soldier-mat', scene);
    this.material.specularColor = Color3.Black();

    this.master = MeshBuilder.CreateBox(
      'soldier',
      { width: 0.66, height: 1.7, depth: 0.46 },
      scene,
    );
    this.master.material = this.material;
    this.master.isPickable = false;
    // Die Truppe bewegt sich ständig; eine Bounding-Box-Prüfung pro Frame
    // würde nur Rechenzeit kosten und nie zum Aussortieren führen.
    this.master.alwaysSelectAsActiveMesh = true;
    this.master.doNotSyncBoundingInfo = true;

    this.matrices = new Float32Array(DISPLAY_CAPS.alliesHard * FLOATS_PER_MATRIX);
    this.master.thinInstanceSetBuffer('matrix', this.matrices, FLOATS_PER_MATRIX, false);
    this.master.thinInstanceCount = 0;

    this.applyTier(0);
  }

  /**
   * @param layout            aktuelle Formation
   * @param count             sichtbare Einheiten
   * @param tierIndex         bestimmt Farbe und Größe
   * @param anchorX/anchorZ   Weltposition der Truppenspitze
   * @param lateralVelocity   m/s — erzeugt die Neigung in die Kurve
   * @param time              Sekunden seit Rundenstart, treibt den Laufzyklus
   */
  update(
    layout: FormationLayout,
    count: number,
    tierIndex: number,
    anchorX: number,
    anchorZ: number,
    lateralVelocity: number,
    time: number,
  ): void {
    this.applyTier(tierIndex);

    const visible = clamp(count, 0, DISPLAY_CAPS.alliesHard);
    const slots = layout.update(visible);

    // Neigung geglättet nachziehen, sonst zuckt die Formation bei jedem
    // Richtungswechsel.
    const targetTilt = clamp(-lateralVelocity * 0.045, -0.26, 0.26);
    this.tilt += (targetTilt - this.tilt) * 0.15;
    Quaternion.RotationYawPitchRollToRef(0, 0, this.tilt, this.rotation);

    const tier = getTier(tierIndex);
    this.scaling.setAll(tier.visual.scale);
    const halfHeight = 0.85 * tier.visual.scale;

    for (let i = 0; i < visible; i += 1) {
      const slot = slots[i];
      if (!slot) break;
      // Statt einer Skelettanimation ein versetzter Sinus-Hopser: auf Distanz
      // nicht von einem Laufzyklus zu unterscheiden und praktisch kostenlos.
      const bob = Math.abs(Math.sin(time * 8.5 + slot.phase)) * 0.15;
      this.position.set(anchorX + slot.x, halfHeight + bob, anchorZ + slot.z);
      Matrix.ComposeToRef(this.scaling, this.rotation, this.position, this.matrix);
      this.matrix.copyToArray(this.matrices, i * FLOATS_PER_MATRIX);
    }

    // Die Zahl der Instanzen erst nach dem Befüllen setzen, sonst zeigt ein
    // wachsender Trupp für einen Frame ungeschriebene Matrizen.
    this.master.thinInstanceCount = visible;
    if (visible > 0) this.master.thinInstanceBufferUpdated('matrix');
    this.renderedCount = visible;
  }

  get visibleCount(): number {
    return this.renderedCount;
  }

  dispose(): void {
    this.master.dispose(false, true);
  }

  private applyTier(tierIndex: number): void {
    if (tierIndex === this.tierIndex) return;
    this.tierIndex = tierIndex;
    const [r, g, b] = getTier(tierIndex).visual.color;
    this.material.unfreeze();
    this.material.diffuseColor = new Color3(r, g, b);
    // Etwas Eigenleuchten, damit die Truppe auch im Schatten der Kulisse
    // ihre Fraktionsfarbe behält — Lesbarkeit vor Realismus.
    this.material.emissiveColor = new Color3(r * 0.16, g * 0.16, b * 0.16);
    this.material.freeze();
  }
}
