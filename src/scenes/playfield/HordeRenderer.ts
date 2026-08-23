import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Matrix, Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { Scene } from '@babylonjs/core/scene';
import '@babylonjs/core/Meshes/thinInstanceMesh';
import { ENEMY_ARCHETYPES, type EnemyArchetypeId } from '../../config/enemyStats';
import { DISPLAY_CAPS } from '../../config/gameBalance';
import { deathProgress, type Enemy } from '../../enemies/EnemyManager';

const FLOATS_PER_MATRIX = 16;

interface Group {
  master: Mesh;
  matrices: Float32Array;
  used: number;
}

/**
 * Zeichnet die Horde.
 *
 * Ein Thin-Instance-Mesh je Archetyp: fünf Draw Calls für beliebig viele
 * Zombies. Getrennt werden sie nur, weil jeder Typ eine eigene Farbe und
 * Größe braucht — innerhalb eines Typs kostet der tausendste Zombie nichts
 * mehr als der erste.
 *
 * Sterbende sacken zusammen, statt zu verschwinden: Ein Gegner, der bei
 * seinem letzten Treffer einfach weg ist, liest sich als Grafikfehler.
 */
export class HordeRenderer {
  private readonly groups = new Map<EnemyArchetypeId, Group>();
  private readonly matrix = Matrix.Identity();
  private readonly position = Vector3.Zero();
  private readonly scaling = Vector3.One();
  private readonly rotation = Quaternion.Identity();
  private drawn = 0;

  constructor(scene: Scene) {
    for (const archetype of ENEMY_ARCHETYPES) {
      const material = new StandardMaterial(`zombie-${archetype.id}-mat`, scene);
      const [r, g, b] = archetype.visual.color;
      material.diffuseColor = new Color3(r, g, b);
      material.specularColor = Color3.Black();
      material.emissiveColor = new Color3(r * 0.14, g * 0.14, b * 0.14);
      material.freeze();

      const master = MeshBuilder.CreateBox(
        `zombie-${archetype.id}`,
        { width: 0.72, height: 1.6, depth: 0.5 },
        scene,
      );
      master.material = material;
      master.isPickable = false;
      master.alwaysSelectAsActiveMesh = true;
      master.doNotSyncBoundingInfo = true;

      const matrices = new Float32Array(DISPLAY_CAPS.enemiesHard * FLOATS_PER_MATRIX);
      master.thinInstanceSetBuffer('matrix', matrices, FLOATS_PER_MATRIX, false);
      master.thinInstanceCount = 0;

      this.groups.set(archetype.id, { master, matrices, used: 0 });
    }
  }

  get drawnCount(): number {
    return this.drawn;
  }

  update(enemies: readonly Enemy[], time: number): void {
    for (const group of this.groups.values()) group.used = 0;
    this.drawn = 0;

    for (const enemy of enemies) {
      const group = this.groups.get(enemy.archetype);
      if (!group || group.used >= DISPLAY_CAPS.enemiesHard) continue;

      const archetype = ENEMY_ARCHETYPES.find((entry) => entry.id === enemy.archetype);
      const baseScale = archetype?.visual.scale ?? 1;

      const dying = deathProgress(enemy);
      // Zusammensacken: flacher werden und zur Seite kippen.
      const scale = baseScale * (1 - dying * 0.65);
      const tilt = dying * 1.4;
      const bob = dying > 0 ? 0 : Math.abs(Math.sin(time * 6 + enemy.id * 1.3)) * 0.13;

      this.scaling.setAll(scale);
      Quaternion.RotationYawPitchRollToRef(0, tilt, 0, this.rotation);
      this.position.set(enemy.x, 0.8 * scale + bob, enemy.z);
      Matrix.ComposeToRef(this.scaling, this.rotation, this.position, this.matrix);
      this.matrix.copyToArray(group.matrices, group.used * FLOATS_PER_MATRIX);
      group.used += 1;
      this.drawn += 1;
    }

    for (const group of this.groups.values()) {
      group.master.thinInstanceCount = group.used;
      if (group.used > 0) group.master.thinInstanceBufferUpdated('matrix');
    }
  }

  dispose(): void {
    for (const group of this.groups.values()) group.master.dispose(false, true);
    this.groups.clear();
  }
}
