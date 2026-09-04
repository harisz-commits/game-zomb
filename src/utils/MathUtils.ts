/** Small, allocation-free math helpers shared across systems. */

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

export function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * t;
}

/**
 * Frame-rate independent smoothing.
 * `rate` is roughly "how many e-foldings per second".
 */
export function damp(from: number, to: number, rate: number, dt: number): number {
  return lerp(from, to, 1 - Math.exp(-rate * dt));
}

export function approach(value: number, target: number, maxDelta: number): number {
  if (value < target) return Math.min(value + maxDelta, target);
  return Math.max(value - maxDelta, target);
}

export function distanceSq(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

export function distance(ax: number, ay: number, bx: number, by: number): number {
  return Math.sqrt(distanceSq(ax, ay, bx, by));
}

/** Compact score/number formatting for the HUD (12.4K, 1.2M). */
export function formatCompact(value: number): string {
  const v = Math.floor(value);
  if (v < 1000) return String(v);
  if (v < 1_000_000) {
    const k = v / 1000;
    return `${k < 10 ? k.toFixed(1) : Math.floor(k)}K`;
  }
  const m = v / 1_000_000;
  return `${m < 10 ? m.toFixed(2) : m.toFixed(1)}M`;
}

export function formatTime(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

/**
 * Distributes `count` units over `rows` rows as evenly as possible, giving
 * leftovers to the middle rows first. This produces the classic 3/4/3 wedge
 * for small squads and a compact block for large armies.
 */
export function distributeRows(count: number, rows: number): number[] {
  if (rows <= 0 || count <= 0) return [];
  const base = Math.floor(count / rows);
  let remainder = count - base * rows;
  const result = new Array<number>(rows).fill(base);

  // Row indices sorted by distance from the vertical centre.
  const centre = (rows - 1) / 2;
  const order: number[] = [];
  for (let i = 0; i < rows; i++) order.push(i);
  order.sort((a, b) => Math.abs(a - centre) - Math.abs(b - centre));

  let i = 0;
  while (remainder > 0) {
    result[order[i % rows]] += 1;
    remainder--;
    i++;
  }
  return result;
}
