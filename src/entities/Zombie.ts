import type Phaser from 'phaser';
import type { EnemyDefinition, EnemyKind } from '../types/game';

/**
 * A pooled enemy. Like soldiers these are not physics bodies - movement and
 * collision are plain arithmetic, which keeps 150 simultaneous zombies cheap.
 */
export class Zombie {
  sprite!: Phaser.GameObjects.Image;
  shadow!: Phaser.GameObjects.Image;

  def!: EnemyDefinition;
  kind: EnemyKind = 'WALKER';
  active = false;
  elite = false;
  boss = false;

  x = 0;
  y = 0;
  /** Horizontal drift so a wave does not collapse into one column. */
  driftX = 0;
  speed = 0;
  radius = 12;

  hp = 1;
  maxHp = 1;
  armor = 0;
  damage = 0;
  attackInterval = 1;
  attackTimer = 0;
  points = 1;
  score = 1;
  stability = 0;

  /** Vertical knockback velocity (negative = pushed back up-field). */
  knockback = 0;
  /** Seconds of white hit flash left. */
  flash = 0;
  /** Blocks re-arming the flash so sustained fire pulses instead of sticking. */
  flashCooldown = 0;
  bobPhase = 0;

  /** Burning (napalm) state. */
  burnTimer = 0;
  burnDps = 0;
  burnTick = 0;

  /** Boss-only state. */
  abilityTimer = 0;
  phaseIndex = 0;

  /** True while the enemy is in contact with the formation. */
  engaged = false;

  get isRanged(): boolean {
    return this.def?.ranged === true;
  }

  get hpRatio(): number {
    return this.maxHp > 0 ? this.hp / this.maxHp : 0;
  }
}
