/** Which lane an object travels down. */
export type Lane = 'SUPPLY' | 'COMBAT';

/**
 * What breaking a supply block gives you. Data only - `LaneObjectSystem`
 * dispatches it, so adding a reward type never touches the battle scene.
 */
export type LaneReward =
  /** The headline reward: the next gun, visible in every soldier's hands. */
  | { type: 'WEAPON' }
  | { type: 'SOLDIERS'; amount: number }
  | { type: 'DAMAGE'; percent: number }
  | { type: 'FIRE_RATE'; percent: number }
  | { type: 'DOUBLE_POINTS'; seconds: number };

export type LaneObjectKind = 'ICE' | 'BARRIER';

/**
 * A block sitting on the bridge and drifting toward the army.
 *
 * Supply lane: a frozen crate. Shoot it open before it drifts past you and you
 * collect what is inside; miss it and it is gone.
 *
 * Combat lane: a penalty barrier. Shoot it down before it reaches the line, or
 * it costs you soldiers.
 *
 * Both are pooled and moved with plain arithmetic - no physics bodies.
 */
export class LaneObject {
  kind: LaneObjectKind = 'ICE';
  lane: Lane = 'SUPPLY';
  active = false;

  x = 0;
  y = 0;
  width = 0;
  height = 0;

  hp = 1;
  maxHp = 1;

  /** Supply blocks only. */
  reward: LaneReward | null = null;
  /** Barriers only: soldiers lost when it reaches the line. */
  penalty = 0;

  /** Seconds of white impact flash left. */
  flash = 0;
  /** Blocks re-arming the flash, so sustained fire pulses instead of sticking. */
  flashCooldown = 0;
  /** Ordering within its lane; the lowest sequence is the front object. */
  sequence = 0;
  /** Last value the HUD label showed; guards against needless DOM writes. */
  shownHp = -1;
  /** Slot the crate eases toward after the stack advances. */
  targetY = 0;
  /** Weapon glyph to show on the crate, or -1 for none. */
  iconWeapon = -1;

  get top(): number {
    return this.y - this.height / 2;
  }

  get bottom(): number {
    return this.y + this.height / 2;
  }

  get hpRatio(): number {
    return this.maxHp > 0 ? Math.max(0, this.hp) / this.maxHp : 0;
  }
}
