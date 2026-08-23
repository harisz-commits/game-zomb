import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Material } from '@babylonjs/core/Materials/material';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { Vector4 } from '@babylonjs/core/Maths/math.vector';
import type { Scene } from '@babylonjs/core/scene';
import type { GateInstance } from '../../run/GateSystem';
import type { GateEffect } from '../../config/gates';
import { GATE_COLOR, GATE_LAYOUT, GATE_TEXT_COLOR, gateLabel } from '../../config/gates';
import { MOVEMENT } from '../../config/gameBalance';
import { clamp } from '../../util/math';

/**
 * Über diese Strecke hinter der Armee verblasst ein passiertes Tor.
 * Ungefähr die Länge einer großen Formation: das Tor ist verschwunden,
 * sobald die letzte Reihe hindurch ist.
 */
const FADE_METERS = 8;
const LABEL_WIDTH = 256;
const LABEL_HEIGHT = 160;
/** Wie weit die Torflügel von der Mittellinie entfernt stehen. */
const PANEL_OFFSET = MOVEMENT.laneHalfWidth * 0.5;

interface PanelPair {
  left: Mesh;
  right: Mesh;
}

/**
 * Zeichnet die Gates.
 *
 * Zwei Sparmaßnahmen tragen das Ganze:
 *
 * 1. **Material-Cache je Beschriftung.** Die Werte stammen aus einer festen
 *    Tabelle, es gibt also nur eine Handvoll verschiedener Schilder. Jedes
 *    wird einmal gezeichnet und danach von allen Toren mit diesem Wert
 *    geteilt, statt pro Tor eine Textur anzulegen.
 * 2. **Mesh-Pool.** Torflügel werden wiederverwendet statt erzeugt und
 *    weggeworfen — dieselbe Überlegung wie bei der Kulisse.
 */
export class GateRenderer {
  private readonly materials = new Map<string, StandardMaterial>();
  private readonly pool: PanelPair[] = [];
  private readonly inUse = new Map<number, PanelPair>();
  private readonly template: Mesh;

  constructor(private readonly scene: Scene) {
    this.template = MeshBuilder.CreatePlane(
      'gate-panel',
      {
        width: GATE_LAYOUT.panelWidth,
        height: GATE_LAYOUT.panelHeight,
        // Der Spieler fährt von hinten heran, kann ein Tor aber auch von
        // vorn sehen, wenn die Kamera hinterherhängt.
        sideOrientation: Mesh.DOUBLESIDE,
        // Babylon spiegelt die Rückseite standardmäßig; bei einer Textur aus
        // Ziffern liest sich das als Spiegelschrift. Beide Seiten bekommen
        // deshalb dieselbe, ungespiegelte UV-Fläche.
        frontUVs: new Vector4(0, 0, 1, 1),
        backUVs: new Vector4(0, 0, 1, 1),
      },
      scene,
    );
    this.template.isVisible = false;
    this.template.isPickable = false;
  }

  /**
   * Bringt die Darstellung mit dem Zustand des GateSystems zur Deckung.
   *
   * @param anchorZ Position der Armee — passierte Tore werden über die
   *   Distanz ausgeblendet. Ein hart abgeschaltetes Tor liest sich als
   *   Grafikfehler, ein stehengebliebenes als grauer Riegel quer durchs Bild.
   */
  sync(gates: readonly GateInstance[], anchorZ: number): void {
    for (const [id, pair] of this.inUse) {
      if (!gates.some((gate) => gate.id === id)) {
        this.release(id, pair);
      }
    }

    for (const gate of gates) {
      let pair = this.inUse.get(gate.id);
      if (!pair) {
        pair = this.acquire();
        this.inUse.set(gate.id, pair);
        pair.left.material = this.materialFor(gate.left);
        pair.right.material = this.materialFor(gate.right);
      }

      pair.left.position.set(-PANEL_OFFSET, GATE_LAYOUT.panelHeight / 2, gate.z);
      pair.right.position.set(PANEL_OFFSET, GATE_LAYOUT.panelHeight / 2, gate.z);

      const behind = anchorZ - gate.z;
      const visibility = behind <= 0 ? 1 : clamp(1 - behind / FADE_METERS, 0, 1);
      pair.left.visibility = visibility;
      pair.right.visibility = visibility;
      pair.left.setEnabled(visibility > 0.02);
      pair.right.setEnabled(visibility > 0.02);
    }
  }

  dispose(): void {
    for (const pair of [...this.pool, ...this.inUse.values()]) {
      pair.left.dispose();
      pair.right.dispose();
    }
    this.pool.length = 0;
    this.inUse.clear();
    for (const material of this.materials.values()) {
      material.diffuseTexture?.dispose();
      material.dispose();
    }
    this.materials.clear();
    this.template.dispose();
  }

  private acquire(): PanelPair {
    const pooled = this.pool.pop();
    if (pooled) {
      pooled.left.setEnabled(true);
      pooled.right.setEnabled(true);
      return pooled;
    }
    const left = this.template.clone(`gate-left-${this.inUse.size}`);
    const right = this.template.clone(`gate-right-${this.inUse.size}`);
    // Das Template ist unsichtbar, damit es selbst nicht gezeichnet wird —
    // und clone() erbt genau das. Die Kopien muessen es zuruecknehmen.
    left.isVisible = true;
    right.isVisible = true;
    return { left, right };
  }

  private release(id: number, pair: PanelPair): void {
    pair.left.setEnabled(false);
    pair.right.setEnabled(false);
    this.inUse.delete(id);
    this.pool.push(pair);
  }

  private materialFor(effect: GateEffect): StandardMaterial {
    const label = gateLabel(effect);
    const cached = this.materials.get(label);
    if (cached) return cached;

    const [r, g, b] = GATE_COLOR;
    const texture = new DynamicTexture(
      `gate-label-${label}`,
      { width: LABEL_WIDTH, height: LABEL_HEIGHT },
      this.scene,
      false,
    );
    texture.hasAlpha = true;

    const ctx = texture.getContext() as CanvasRenderingContext2D;
    ctx.clearRect(0, 0, LABEL_WIDTH, LABEL_HEIGHT);
    // Alle Tore tragen dieselbe Farbe. Verriete sie, ob eine Seite gut ist,
    // müsste niemand mehr die Zahl lesen.
    ctx.fillStyle = `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, 0.92)`;
    ctx.fillRect(0, 0, LABEL_WIDTH, LABEL_HEIGHT);
    ctx.fillStyle = 'rgba(20, 26, 34, 0.85)';
    ctx.fillRect(0, 0, LABEL_WIDTH, 6);
    ctx.fillRect(0, LABEL_HEIGHT - 6, LABEL_WIDTH, 6);

    ctx.fillStyle = GATE_TEXT_COLOR;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `bold ${this.fitFontSize(ctx, label)}px system-ui, sans-serif`;
    ctx.fillText(label, LABEL_WIDTH / 2, LABEL_HEIGHT / 2 + 4);
    // update(invertY) MUSS true bleiben (der Standard): die Zeichenfläche
    // zählt y nach unten, die Textur ohne diesen Schalter nach oben — sonst
    // steht die Beschriftung kopfüber. Bei Ziffern fällt das kaum auf,
    // eine "2" wird dann aber als "5" gelesen.
    texture.update(true);

    const material = new StandardMaterial(`gate-mat-${label}`, this.scene);
    material.diffuseTexture = texture;
    material.emissiveTexture = texture;
    // Flach und selbstleuchtend: das Schild muss aus jeder Entfernung
    // gleich gut lesbar sein, unabhängig vom Sonnenstand.
    material.disableLighting = true;
    material.diffuseColor = Color3.Black();
    material.useAlphaFromDiffuseTexture = true;
    material.transparencyMode = Material.MATERIAL_ALPHABLEND;
    material.backFaceCulling = false;
    material.freeze();

    this.materials.set(label, material);
    return material;
  }

  /**
   * Größtmögliche Schrift, die noch aufs Schild passt.
   *
   * Seit Faktor- und Prozentschreibweise gemischt werden, reichen die
   * Aufschriften von "×2" bis "−95%". Eine feste Schriftgröße würde die
   * langen entweder abschneiden oder die kurzen verschenken — und Lesbarkeit
   * ist hier die eigentliche Spielmechanik.
   */
  private fitFontSize(ctx: CanvasRenderingContext2D, label: string): number {
    const maxWidth = LABEL_WIDTH * 0.86;
    for (let size = 96; size > 30; size -= 4) {
      ctx.font = `bold ${size}px system-ui, sans-serif`;
      if (ctx.measureText(label).width <= maxWidth) return size;
    }
    return 30;
  }
}
