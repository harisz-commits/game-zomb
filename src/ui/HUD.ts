import { UiLayer, el } from './dom';
import { formatCompact, formatDuration } from '../util/format';

export interface HudModel {
  tierName: string;
  /** Echte Truppenstärke des aktuellen Tiers — nicht die gezeichnete Zahl. */
  unitCount: number;
  combatPower: number;
  /** Angefangene Einheit des aktuellen Tiers, [0, 1). */
  overflow: number;
  /** Fortschritt [0,1] innerhalb des Sektors. */
  sectorProgress: number;
  sectorIndex: number;
  elapsedSeconds: number;
  kills: number;
}

/**
 * Run-HUD. In Phase 1 zeigt es Sektor, Distanz und Zeit; die Armee-Felder
 * sind bereits angelegt, werden aber erst ab Phase 3 mit echten Werten
 * gefuettert.
 */
export class HUD {
  private readonly layer: UiLayer;
  private readonly tierLabel: HTMLElement;
  private readonly countLabel: HTMLElement;
  private readonly powerLabel: HTMLElement;
  private readonly timeLabel: HTMLElement;
  private readonly killLabel: HTMLElement;
  private readonly sectorLabel: HTMLElement;
  private readonly progressFill: HTMLElement;
  private readonly overflowFill: HTMLElement;
  private readonly banner: HTMLElement;
  private bannerUntil = 0;
  private readonly bossBox: HTMLElement;
  private readonly bossName: HTMLElement;
  private readonly bossFill: HTMLElement;

  constructor(parent: HTMLElement) {
    this.layer = new UiLayer(parent, 'hud');

    const top = this.layer.add(el('div', 'hud-top'));
    const left = el('div', 'hud-block');
    this.tierLabel = el('div', 'hud-tier', '—');
    this.countLabel = el('div', 'hud-count', '');
    left.appendChild(this.tierLabel);
    left.appendChild(this.countLabel);

    // Restkraft: der Anteil einer angefangenen Einheit des aktuellen Tiers.
    // Ohne diese Anzeige wirkt Wachstum zwischen zwei ganzen Einheiten wie
    // Stillstand — gerade bei hohen Tiers, wo eine Einheit viel Power ist.
    const overflowBar = el('div', 'hud-overflow');
    this.overflowFill = el('i', 'hud-overflow-fill');
    overflowBar.appendChild(this.overflowFill);
    left.appendChild(overflowBar);

    const right = el('div', 'hud-block hud-right');
    this.powerLabel = el('div', 'hud-power', '');
    this.timeLabel = el('div', 'hud-time', '0:00');
    this.killLabel = el('div', 'hud-kills', '');
    right.appendChild(this.powerLabel);
    right.appendChild(this.killLabel);
    right.appendChild(this.timeLabel);

    top.appendChild(left);
    top.appendChild(right);

    const progress = this.layer.add(el('div', 'hud-progress'));
    this.sectorLabel = el('div', 'hud-sector', 'SECTOR 1');
    const bar = el('div', 'hud-bar');
    this.progressFill = el('i', 'hud-bar-fill');
    bar.appendChild(this.progressFill);
    progress.appendChild(this.sectorLabel);
    progress.appendChild(bar);

    this.banner = this.layer.add(el('div', 'hud-banner'));

    // Bosszeile: eigene Leiste ganz oben, damit sie nicht mit dem
    // Sektorfortschritt verwechselt wird.
    this.bossBox = this.layer.add(el('div', 'hud-boss'));
    this.bossName = el('div', 'hud-boss-name', '');
    const bossBar = el('div', 'hud-boss-bar');
    this.bossFill = el('i', 'hud-boss-fill');
    bossBar.appendChild(this.bossFill);
    this.bossBox.appendChild(this.bossName);
    this.bossBox.appendChild(bossBar);
  }

  /** Zeigt oder verbirgt die Lebensleiste des Bosses. */
  renderBoss(name: string | null, hpRatio: number): void {
    // Bosskampf und Sektorfortschritt teilen sich den Platz unter dem HUD.
    // Beide gleichzeitig standen übereinander und waren unlesbar — und
    // während eines Bosskampfes steht der Sektor ohnehin still.
    this.layer.root.classList.toggle('boss-active', name !== null);
    if (!name) {
      this.bossBox.classList.remove('visible');
      return;
    }
    this.bossBox.classList.add('visible');
    this.bossName.textContent = name.toUpperCase();
    this.bossFill.style.width = `${Math.max(0, Math.min(1, hpRatio)) * 100}%`;
  }

  /**
   * Zeigt kurz an, dass die Truppe aufgestiegen ist.
   *
   * Nach einer Beförderung stehen WENIGER Figuren auf dem Feld — aus 140
   * Militia werden 12 Riflemen. Ohne diesen Moment liest sich der Aufstieg
   * als Verlust, also als das Gegenteil dessen, was er ist.
   */
  showPromotion(tierName: string, nowSeconds: number): void {
    this.banner.textContent = `PROMOTED — ${tierName.toUpperCase()}`;
    this.banner.classList.add('visible');
    this.bannerUntil = nowSeconds + 2.2;
  }

  render(model: HudModel): void {
    this.tierLabel.textContent = model.tierName;
    this.countLabel.textContent = `×${formatCompact(model.unitCount)}`;
    this.powerLabel.textContent = `PWR ${formatCompact(model.combatPower)}`;
    this.timeLabel.textContent = formatDuration(model.elapsedSeconds);
    this.killLabel.textContent = model.kills > 0 ? `☠ ${formatCompact(model.kills)}` : '';
    this.sectorLabel.textContent = `SECTOR ${model.sectorIndex + 1}`;
    this.progressFill.style.width = `${Math.round(model.sectorProgress * 100)}%`;
    this.overflowFill.style.width = `${Math.round(model.overflow * 100)}%`;

    if (this.bannerUntil > 0 && model.elapsedSeconds > this.bannerUntil) {
      this.bannerUntil = 0;
      this.banner.classList.remove('visible');
    }
  }

  dispose(): void {
    this.layer.dispose();
  }
}
