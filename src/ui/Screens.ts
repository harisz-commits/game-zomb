import { FAMILY_COLORS, FAMILY_ICONS, GAME_SUBTITLE, GAME_TITLE, RARITY_COLORS } from '../config/GameConfig';
import type { RunStats, UpgradeDefinition } from '../types/game';
import { formatCompact, formatTime } from '../utils/MathUtils';

const hex = (value: number): string => `#${value.toString(16).padStart(6, '0')}`;

/** Base class for the full-screen overlays: menu, draft, summary. */
class Screen {
  protected readonly root: HTMLElement;

  constructor(parent: HTMLElement, className: string) {
    this.root = document.createElement('div');
    this.root.className = `screen ${className}`;
    parent.appendChild(this.root);
  }

  show(): void {
    this.root.classList.add('visible');
  }

  hide(): void {
    this.root.classList.remove('visible');
  }

  get visible(): boolean {
    return this.root.classList.contains('visible');
  }

  destroy(): void {
    this.root.remove();
  }
}

export class MenuScreen extends Screen {
  constructor(
    parent: HTMLElement,
    handlers: { onPlay: (endless: boolean) => void },
    best: { score: number; endless: number; endlessUnlocked: boolean },
  ) {
    super(parent, 'menu');
    this.root.innerHTML = `
      <div class="menu-inner">
        <h1>${GAME_TITLE}</h1>
        <p class="subtitle">${GAME_SUBTITLE}</p>
        <button class="primary" data-play>PLAY</button>
        <button class="secondary" data-endless ${best.endlessUnlocked ? '' : 'disabled'}>
          ${best.endlessUnlocked ? 'ENDLESS' : 'ENDLESS — FINISH A RUN FIRST'}
        </button>
        <p class="best">BEST ${formatCompact(best.score)}${
          best.endless > 0 ? ` · ENDLESS ${formatCompact(best.endless)}` : ''
        }</p>
        <p class="how">Drag to move your line. You fire straight ahead.<br />
          Left lane: break supply crates for weapons. Right lane: hold the horde.</p>
      </div>
    `;
    this.root.querySelector('[data-play]')?.addEventListener('click', () => handlers.onPlay(false));
    this.root
      .querySelector('[data-endless]')
      ?.addEventListener('click', () => best.endlessUnlocked && handlers.onPlay(true));
  }
}

export class DraftScreen extends Screen {
  private choose: ((definition: UpgradeDefinition) => void) | null = null;

  constructor(parent: HTMLElement) {
    super(parent, 'draft');
  }

  open(choices: UpgradeDefinition[], onChoose: (definition: UpgradeDefinition) => void): void {
    this.choose = onChoose;
    this.root.innerHTML = `
      <div class="draft-inner">
        <h2>PROMOTION</h2>
        <p class="draft-sub">CHOOSE ONE UPGRADE</p>
        <div class="cards"></div>
      </div>
    `;
    const cards = this.root.querySelector('.cards') as HTMLElement;
    for (const definition of choices) {
      const card = document.createElement('button');
      card.className = 'card';
      card.style.setProperty('--rarity', hex(RARITY_COLORS[definition.rarity] ?? 0x9fb0c8));
      card.style.setProperty('--family', hex(FAMILY_COLORS[definition.family] ?? 0x9fb0c8));
      card.innerHTML = `
        <span class="rarity">${definition.rarity}</span>
        <span class="icon">${FAMILY_ICONS[definition.family] ?? '◆'}</span>
        <span class="name">${definition.name}</span>
        <span class="desc">${definition.description}</span>
        <span class="family">${definition.family}</span>
      `;
      card.addEventListener('click', () => {
        const pick = this.choose;
        this.choose = null;
        this.hide();
        pick?.(definition);
      });
      cards.appendChild(card);
    }
    this.show();
  }
}

export class SummaryScreen extends Screen {
  constructor(
    parent: HTMLElement,
    private readonly handlers: { onRetry: () => void; onMenu: () => void },
  ) {
    super(parent, 'summary');
  }

  open(stats: RunStats, bestScore: number, isNewBest: boolean): void {
    this.root.innerHTML = `
      <div class="summary-inner">
        <h2 style="color:${stats.victory ? '#7fd4a2' : '#ff5a5a'}">
          ${stats.victory ? 'BRIDGE HELD' : 'LINE BROKEN'}
        </h2>
        <div class="score">${formatCompact(stats.score)}</div>
        ${isNewBest ? '<div class="newbest">NEW BEST</div>' : `<div class="best">BEST ${formatCompact(bestScore)}</div>`}
        <dl>
          <div><dt>SURVIVED</dt><dd>${formatTime(stats.elapsed)}</dd></div>
          <div><dt>KILLS</dt><dd>${formatCompact(stats.kills)}</dd></div>
          <div><dt>PROMOTIONS</dt><dd>${stats.promotions}</dd></div>
          <div><dt>PEAK ARMY</dt><dd>${stats.maxArmySize}</dd></div>
          <div><dt>FINAL RANK</dt><dd>${stats.tierName}</dd></div>
          <div><dt>BOSSES</dt><dd>${stats.bossKills}</dd></div>
        </dl>
        <button class="primary" data-retry>RETRY</button>
        <button class="secondary" data-menu>MENU</button>
      </div>
    `;
    this.root.querySelector('[data-retry]')?.addEventListener('click', () => {
      this.hide();
      this.handlers.onRetry();
    });
    this.root.querySelector('[data-menu]')?.addEventListener('click', () => {
      this.hide();
      this.handlers.onMenu();
    });
    this.show();
  }
}
