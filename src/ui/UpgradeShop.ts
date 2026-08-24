import type { SaveData } from '../save/SaveSchema';
import type { MetaUpgradeId } from '../config/metaUpgrades';
import { offersFor } from '../progression/MetaProgression';
import { formatCompact } from '../util/format';
import { UiLayer, button, el } from './dom';

export interface UpgradeShopOptions {
  save: SaveData;
  /** Kauf durchführen; liefert true, wenn er geklappt hat. */
  onBuy: (id: MetaUpgradeId) => boolean;
  onClose: () => void;
}

/**
 * Der Laden zwischen den Runden.
 *
 * Baut sich nach jedem Kauf komplett neu auf. Das ist verschwenderisch und
 * hier trotzdem richtig: Ein Kauf ändert Kontostand, Stufe, Preis und
 * Bezahlbarkeit ALLER Einträge gleichzeitig — punktuelles Nachziehen wäre
 * mehr Code und mehr Gelegenheit, dass die Anzeige lügt.
 */
export class UpgradeShop {
  private readonly layer: UiLayer;

  constructor(
    parent: HTMLElement,
    private readonly options: UpgradeShopOptions,
  ) {
    this.layer = new UiLayer(parent, 'shop');
    this.layer.root.classList.add('clickable');
    this.render();
  }

  dispose(): void {
    this.layer.dispose();
  }

  private render(): void {
    const { save } = this.options;
    this.layer.root.replaceChildren();

    const header = el('div', 'shop-header');
    header.appendChild(el('div', 'shop-title', 'UPGRADES'));
    const wallet = el('div', 'shop-wallet');
    wallet.appendChild(el('span', 'chip', `◎ ${formatCompact(save.meta.coins)}`));
    wallet.appendChild(el('span', 'chip', `⚙ ${formatCompact(save.meta.techParts)}`));
    header.appendChild(wallet);
    this.layer.add(header);

    const list = this.layer.add(el('div', 'shop-list'));
    for (const offer of offersFor(save)) {
      const row = el('div', `shop-row${offer.maxed ? ' maxed' : ''}`);

      const info = el('div', 'shop-info');
      info.appendChild(el('div', 'shop-name', offer.spec.name));
      info.appendChild(
        el(
          'div',
          'shop-effect',
          offer.maxed ? offer.currentDescription : offer.nextDescription,
        ),
      );
      info.appendChild(el('div', 'shop-level', `LV ${offer.level}/${offer.spec.maxLevel}`));
      row.appendChild(info);

      if (offer.maxed) {
        row.appendChild(el('div', 'shop-maxed', 'MAX'));
      } else {
        const symbol = offer.spec.currency === 'coins' ? '◎' : '⚙';
        const buy = button(
          `${symbol} ${formatCompact(offer.cost)}`,
          () => {
            if (this.options.onBuy(offer.spec.id)) this.render();
          },
          `shop-buy${offer.affordable ? '' : ' unaffordable'}`,
        );
        buy.disabled = !offer.affordable;
        row.appendChild(buy);
      }
      list.appendChild(row);
    }

    this.layer.add(button('Back', () => this.options.onClose(), 'primary shop-back'));
  }
}
