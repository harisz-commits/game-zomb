import type { BattleContext } from '../core/BattleContext';

/**
 * Unified input: touch, mouse and keyboard all end up as a single "target X"
 * for the formation.
 *
 * Touch/mouse are absolute - the army follows your finger, mapped onto the
 * deck by a ray from the camera - and keyboard is relative. Everything is
 * smoothed inside ArmySystem so the crowd never teleports.
 */
export class InputSystem {
  private pointerActive = false;
  private left = false;
  private right = false;
  private readonly bound: (() => void)[] = [];

  /** Set once the player has actually moved - ends the first tutorial hint. */
  hasMoved = false;

  constructor(
    private readonly ctx: BattleContext,
    private readonly canvas: HTMLElement,
    /** Maps a screen point onto the deck. Owned by the view. */
    private readonly toWorldX: (screenX: number, screenY: number) => number,
  ) {}

  create(): void {
    const onDown = (event: PointerEvent) => {
      this.pointerActive = true;
      this.canvas.setPointerCapture?.(event.pointerId);
      this.moveTo(event);
    };
    const onMove = (event: PointerEvent) => {
      // Desktop: only follow while a button is held, which matches the phone.
      if (!this.pointerActive) return;
      this.moveTo(event);
    };
    const onUp = (event: PointerEvent) => {
      this.pointerActive = false;
      this.canvas.releasePointerCapture?.(event.pointerId);
    };
    const onKey = (down: boolean) => (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft' || event.key === 'a' || event.key === 'A') this.left = down;
      if (event.key === 'ArrowRight' || event.key === 'd' || event.key === 'D') this.right = down;
    };
    const keyDown = onKey(true);
    const keyUp = onKey(false);

    this.canvas.addEventListener('pointerdown', onDown);
    this.canvas.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    window.addEventListener('keydown', keyDown);
    window.addEventListener('keyup', keyUp);

    this.bound.push(
      () => this.canvas.removeEventListener('pointerdown', onDown),
      () => this.canvas.removeEventListener('pointermove', onMove),
      () => window.removeEventListener('pointerup', onUp),
      () => window.removeEventListener('pointercancel', onUp),
      () => window.removeEventListener('keydown', keyDown),
      () => window.removeEventListener('keyup', keyUp),
    );
  }

  private moveTo(event: PointerEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    this.ctx.army.setTargetX(this.toWorldX(event.clientX - rect.left, event.clientY - rect.top));
    this.hasMoved = true;
  }

  update(dt: number): void {
    if (this.pointerActive) return;
    let direction = 0;
    if (this.left) direction -= 1;
    if (this.right) direction += 1;
    if (direction !== 0) {
      this.ctx.army.nudge(direction, dt);
      this.hasMoved = true;
    }
  }

  destroy(): void {
    for (const off of this.bound) off();
    this.bound.length = 0;
  }
}
