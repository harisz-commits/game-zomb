import type { Zombie } from './Zombie';

/**
 * A soldier is *data only*: its position comes from a formation slot, never
 * from a physics body, and it owns no render object at all - `BattleView`
 * reads this and writes one instanced transform per frame. That is what lets
 * 140 of them cost three draw calls.
 */
export class Soldier {

  /** Current rendered position (eases toward the slot). */
  x = 0;
  y = 0;
  /** Formation slot position. */
  slotX = 0;
  slotY = 0;
  /** Slot offset relative to the formation centre (layout is cached). */
  slotOffsetX = 0;

  hp = 100;
  maxHp = 100;

  /** Seconds until this soldier may fire again. */
  cooldown = 0;
  /** Cached target, refreshed on a timer instead of every frame. */
  target: Zombie | null = null;
  targetTimer = 0;

  /** 0 -> 1 spawn-in animation progress. */
  spawnT = 0;
  /** Row index inside the formation (0 = front line). */
  row = 0;
  /** Small per-soldier phase so idle motion is not synchronised. */
  phase = 0;
  /** Remaining seconds of hit flash. */
  flash = 0;
  /** Walk-cycle phase, advanced by the view. */
  stride = 0;

  reset(x: number, y: number, hp: number): void {
    this.x = x;
    this.y = y;
    this.slotX = x;
    this.slotY = y;
    this.hp = hp;
    this.maxHp = hp;
    this.cooldown = 0;
    this.target = null;
    this.targetTimer = 0;
    this.spawnT = 0;
    this.flash = 0;
    this.stride = Math.random() * Math.PI * 2;
  }
}
