/**
 * Fixed-capacity object pool.
 *
 * Nothing in the gameplay loop may allocate per frame - every transient entity
 * (tracer, particle, damage number, zombie, ...) comes from one of these.
 */
export class ObjectPool<T> {
  private readonly items: T[] = [];
  private readonly free: T[] = [];
  private liveCount = 0;

  constructor(
    private readonly factory: () => T,
    private readonly onRelease: (item: T) => void,
    private readonly capacity: number,
    prewarm = 0,
  ) {
    const initial = Math.min(prewarm, capacity);
    for (let i = 0; i < initial; i++) {
      const item = this.factory();
      this.items.push(item);
      this.onRelease(item);
      this.free.push(item);
    }
  }

  /** Returns null when the pool is exhausted (hard entity cap reached). */
  obtain(): T | null {
    const recycled = this.free.pop();
    if (recycled) {
      this.liveCount++;
      return recycled;
    }
    if (this.items.length >= this.capacity) return null;
    const item = this.factory();
    this.items.push(item);
    this.liveCount++;
    return item;
  }

  release(item: T): void {
    this.onRelease(item);
    this.free.push(item);
    if (this.liveCount > 0) this.liveCount--;
  }

  get active(): number {
    return this.liveCount;
  }

  get total(): number {
    return this.items.length;
  }

  get all(): readonly T[] {
    return this.items;
  }
}
