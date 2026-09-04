import Phaser from 'phaser';
import type { BattleContext } from '../core/BattleContext';

/**
 * Unified input: touch, mouse and keyboard all end up as a single "target X"
 * for the formation.
 *
 * Touch/mouse are absolute (the army follows your finger), keyboard is
 * relative. Everything is smoothed inside ArmySystem so the crowd never
 * teleports.
 */
export class InputSystem {
  private pointerActive = false;
  private keyLeft?: Phaser.Input.Keyboard.Key;
  private keyRight?: Phaser.Input.Keyboard.Key;
  private keyA?: Phaser.Input.Keyboard.Key;
  private keyD?: Phaser.Input.Keyboard.Key;

  /** Set once the player has actually moved - used to end the first hint. */
  hasMoved = false;

  constructor(private readonly ctx: BattleContext) {}

  create(): void {
    const input = this.ctx.scene.input;

    input.on(Phaser.Input.Events.POINTER_DOWN, this.onPointer, this);
    input.on(Phaser.Input.Events.POINTER_MOVE, this.onPointerMove, this);
    input.on(Phaser.Input.Events.POINTER_UP, this.onPointerUp, this);
    input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.onPointerUp, this);

    const keyboard = this.ctx.scene.input.keyboard;
    if (keyboard) {
      this.keyLeft = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.LEFT);
      this.keyRight = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.RIGHT);
      this.keyA = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A);
      this.keyD = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D);
    }
  }

  private onPointer(pointer: Phaser.Input.Pointer): void {
    this.pointerActive = true;
    this.moveTo(pointer);
  }

  private onPointerMove(pointer: Phaser.Input.Pointer): void {
    // Desktop: only follow while a button is held (matches the mobile feel).
    if (!pointer.isDown && !this.ctx.scene.sys.game.device.input.touch) return;
    if (!pointer.isDown) return;
    this.moveTo(pointer);
  }

  private onPointerUp(): void {
    this.pointerActive = false;
  }

  private moveTo(pointer: Phaser.Input.Pointer): void {
    const worldX = this.ctx.viewport.screenToWorldX(pointer.x);
    this.ctx.army.setTargetX(worldX);
    this.hasMoved = true;
  }

  update(dt: number): void {
    if (this.pointerActive) return;
    let direction = 0;
    if (this.keyLeft?.isDown || this.keyA?.isDown) direction -= 1;
    if (this.keyRight?.isDown || this.keyD?.isDown) direction += 1;
    if (direction !== 0) {
      this.ctx.army.nudge(direction, dt);
      this.hasMoved = true;
    }
  }

  destroy(): void {
    const input = this.ctx.scene.input;
    input.off(Phaser.Input.Events.POINTER_DOWN, this.onPointer, this);
    input.off(Phaser.Input.Events.POINTER_MOVE, this.onPointerMove, this);
    input.off(Phaser.Input.Events.POINTER_UP, this.onPointerUp, this);
    input.off(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.onPointerUp, this);
  }
}
