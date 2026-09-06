import * as THREE from 'three';

/**
 * A character or prop is a list of boxes, merged into ONE geometry with the
 * colour baked into the vertices.
 *
 * That is the whole trick behind the look: detail costs nothing at runtime,
 * because a model is drawn with a single InstancedMesh no matter how many
 * boxes it is made of, and 180 zombies are one draw call rather than 180. It
 * also keeps the "zero asset bytes" property the sprite build had - every
 * model is code, so there is nothing to download.
 */
export interface Box {
  /** Centre, in model units. */
  p: [number, number, number];
  /** Size. */
  s: [number, number, number];
  /** Packed 0xRRGGBB, baked into the vertex colours. */
  c: number;
  /** Optional rotation, applied before the translation. */
  r?: [number, number, number];
}

/** Multiplies a packed colour's brightness, clamped per channel. */
export function shade(color: number, factor: number): number {
  const c = new THREE.Color(color);
  return new THREE.Color(
    Math.min(1, c.r * factor),
    Math.min(1, c.g * factor),
    Math.min(1, c.b * factor),
  ).getHex();
}

/**
 * Merges boxes into one non-indexed geometry carrying position, normal and
 * colour. Non-indexed because flat shading wants per-face normals anyway, and
 * it makes the merge a plain concatenation.
 */
export function mergeBoxes(parts: Box[]): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const colour = new THREE.Color();

  for (const part of parts) {
    const box = new THREE.BoxGeometry(part.s[0], part.s[1], part.s[2]);
    if (part.r) {
      if (part.r[0]) box.rotateX(part.r[0]);
      if (part.r[1]) box.rotateY(part.r[1]);
      if (part.r[2]) box.rotateZ(part.r[2]);
    }
    box.translate(part.p[0], part.p[1], part.p[2]);

    const flat = box.toNonIndexed();
    box.dispose();
    const pos = flat.attributes.position.array;
    const nrm = flat.attributes.normal.array;
    colour.setHex(part.c);
    for (let i = 0; i < pos.length; i += 3) {
      positions.push(pos[i], pos[i + 1], pos[i + 2]);
      normals.push(nrm[i], nrm[i + 1], nrm[i + 2]);
      colors.push(colour.r, colour.g, colour.b);
    }
    flat.dispose();
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeBoundingSphere();
  return geometry;
}

/** The one material every model uses: vertex colours, flat shading, lit. */
export function modelMaterial(): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
}
