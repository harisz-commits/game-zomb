import type Phaser from 'phaser';
import type { Zombie } from './Zombie';

/**
 * A soldier is *data first*: its position is derived from a formation slot,
 * never from a physics body. 140 soldiers therefore cost 140 cheap sprite
 * transforms instead of 140 simulated bodies.
 */
export class Soldier {
  sprite!: Phaser.GameObjects.Image;

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
  }
}
