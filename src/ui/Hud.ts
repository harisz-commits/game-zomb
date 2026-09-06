import { BALANCE } from '../config/BalanceConfig';
import type { BattleContext } from '../core/BattleContext';
import { GameEvent, type GameEventName } from '../core/EventBus';
import { formatCompact, formatTime } from '../utils/MathUtils';

/**
 * The in-battle HUD, as DOM.
 *
 * Text in the DOM rather than in the canvas: it is sharper at any device pixel
 * ratio, it costs no draw call, and it does not fight the 3D scene for depth
 * order. The HUD only ever reads state - it never drives the simulation.
 */
export class Hud {
  private readonly root: HTMLElement;
  private readonly armyValue: HTMLElement;
  private readonly tierLabel: HTMLElement;
  private readonly promoFill: HTMLElement;
  private readonly promoText: HTMLElement;
  private readonly weaponChip: HTMLElement;
  private readonly timer: HTMLElement;
  private readonly phase: HTMLElement;
  private readonly score: HTMLElement;
  private readonly bossBar: HTMLElement;
  private readonly bossFill: HTMLElement;
  private readonly bossName: HTMLElement;
  private readonly banner: HTMLElement;
  private readonly hint: HTMLElement;

  private shownArmy = -1;
  private shownWeapon = -1;
  private bannerTimer = 0;
  private hintTimer = 0;
  private readonly unsubscribe: (() => void)[] = [];

  constructor(
    private readonly ctx: BattleContext,
    parent: HTMLElement,
  ) {
    this.root = document.createElement('div');
    this.root.className = 'hud';
    this.root.innerHTML = `
      <div class="hud-army">
        <div class="army-value">0</div>
        <div class="tier-label">SOLDIERS</div>
        <div class="promo-bar"><div class="promo-fill"></div></div>
        <div class="promo-text"></div>
        <div class="weapon-chip"></div>
      </div>
      <div class="hud-centre">
        <div class="timer">0:00</div>
        <div class="phase"></div>
        <div class="boss-bar"><div class="boss-fill"></div><span class="boss-name"></span></div>
      </div>
      <div class="hud-score">0</div>
      <div class="banner"></div>
      <div class="hint"></div>
    `;
    parent.appendChild(this.root);

    const pick = <T extends HTMLElement>(sel: string): T =>
      this.root.querySelector(sel) as T;
    this.armyValue = pick('.army-value');
    this.tierLabel = pick('.tier-label');
    this.promoFill = pick('.promo-fill');
    this.promoText = pick('.promo-text');
    this.weaponChip = pick('.weapon-chip');
    this.timer = pick('.timer');
    this.phase = pick('.phase');
    this.score = pick('.hud-score');
    this.bossBar = pick('.boss-bar');
    this.bossFill = pick('.boss-fill');
    this.bossName = pick('.boss-name');
    this.banner = pick('.banner');
    this.hint = pick('.hint');

    const on = (event: GameEventName, handler: (payload: never) => void): void => {
      ctx.events.on(event as never, handler as never);
      this.unsubscribe.push(() => ctx.events.off(event as never, handler as never));
    };
    on(GameEvent.PHASE_CHANGED, ({ label }: { label: string }) =>
      this.showBanner(label, '#ffc65c'),
    );
    on(GameEvent.BOSS_SPAWNED, ({ name }: { name: string }) => this.showBanner(name, '#ff5a5a'));
    on(GameEvent.PROMOTION_COMPLETE, ({ tierName }: { tierName: string }) =>
      this.showBanner(tierName, '#7fd4a2'),
    );
    on(GameEvent.TUTORIAL_HINT, ({ text, duration }: { text: string; duration: number }) =>
      this.showHint(text, duration),
    );
    on(GameEvent.ENDLESS_MODIFIER, ({ label }: { label: string }) =>
      this.showBanner(label, '#b56cff'),
    );
  }

  showBanner(text: string, color: string): void {
    this.banner.textContent = text;
    this.banner.style.color = color;
    this.banner.classList.add('visible');
    this.bannerTimer = 1.8;
  }

  showHint(text: string, duration: number): void {
    this.hint.textContent = text;
    this.hint.classList.add('visible');
    this.hintTimer = duration;
  }

  update(dt: number): void {
    const ctx = this.ctx;
    const army = ctx.army;

    if (army.count !== this.shownArmy) {
      this.shownArmy = army.count;
      this.armyValue.textContent = String(army.count);
      this.tierLabel.textContent = army.currentTier.name;
      this.armyValue.classList.remove('pop');
      void this.armyValue.offsetWidth;
      this.armyValue.classList.add('pop');
    }

    const threshold = ctx.promotion.getThreshold(ctx.upgrades.modifiers);
    this.promoFill.style.width = `${Math.min(100, (army.count / threshold) * 100)}%`;
    this.promoText.textContent = `${army.count} / ${threshold}`;

    if (ctx.upgrades.weaponIndex !== this.shownWeapon) {
      this.shownWeapon = ctx.upgrades.weaponIndex;
      this.weaponChip.textContent = ctx.upgrades.weapon.name;
      this.weaponChip.classList.remove('pop');
      void this.weaponChip.offsetWidth;
      this.weaponChip.classList.add('pop');
    }

    const elapsed = ctx.runtime.elapsed;
    this.timer.textContent =
      ctx.runtime.mode === 'CAMPAIGN'
        ? formatTime(Math.max(0, BALANCE.RUN_DURATION - elapsed))
        : formatTime(elapsed);
    this.phase.textContent = ctx.director.phase.label;
    this.score.textContent = formatCompact(ctx.score.score);

    const boss = ctx.enemies.currentBoss;
    if (boss) {
      this.bossBar.classList.add('visible');
      this.bossFill.style.width = `${Math.max(0, boss.hpRatio) * 100}%`;
      this.bossName.textContent = boss.def.name;
    } else {
      this.bossBar.classList.remove('visible');
    }

    if (this.bannerTimer > 0) {
      this.bannerTimer -= dt;
      if (this.bannerTimer <= 0) this.banner.classList.remove('visible');
    }
    if (this.hintTimer > 0) {
      this.hintTimer -= dt;
      if (this.hintTimer <= 0) this.hint.classList.remove('visible');
    }
  }

  destroy(): void {
    for (const off of this.unsubscribe) off();
    this.unsubscribe.length = 0;
    this.root.remove();
  }
}
