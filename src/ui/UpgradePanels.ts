import type { UpgradeCard } from '../run/UpgradeDraft';
import type { Rarity } from '../config/upgrades';
import { UiLayer, el } from './dom';

const RARITY_LABEL: Readonly<Record<Rarity, string>> = {
  common: 'COMMON',
  rare: 'RARE',
  epic: 'EPIC',
  legendary: 'LEGENDARY',
};

/**
 * Das Zwischenspiel: die Runde hält an, drei Karten kommen hoch, der Spieler
 * wählt genau eine.
 *
 * Die Karten decken nacheinander auf statt gleichzeitig zu erscheinen. Der
 * kurze Versatz ist der Grund, warum sich das Ziehen wie ein Ereignis anfühlt
 * und nicht wie ein Dialogfenster — und er gibt der Seltenheit einen Moment
 * zu wirken, bevor die nächste Karte davon ablenkt.
 */
export class UpgradeDraftPanel {
  private readonly layer: UiLayer;
  private readonly timers: number[] = [];

  /**
   * @param promotedTo Name des neuen Tiers, falls an diesem Kontrollpunkt
   *   befördert wurde. Die Meldung gehört HIER hinein und nicht als eigenes
   *   Banner dahinter: beides passiert im selben Moment, und zwei
   *   übereinanderliegende Einblendungen lesen sich als Fehler.
   */
  constructor(
    parent: HTMLElement,
    cards: readonly UpgradeCard[],
    onPick: (card: UpgradeCard) => void,
    promotedTo: string | null = null,
  ) {
    this.layer = new UiLayer(parent, 'draft');
    this.layer.root.classList.add('clickable');

    this.layer.add(el('div', 'draft-kicker', 'CHECKPOINT'));
    if (promotedTo) {
      this.layer.add(el('div', 'draft-promotion', `PROMOTED — ${promotedTo.toUpperCase()}`));
    }
    this.layer.add(el('div', 'draft-title', 'Choose one'));

    const row = this.layer.add(el('div', 'draft-cards'));
    let picked = false;

    cards.forEach((card, index) => {
      const node = el('button', `draft-card rarity-${card.rarity}`);
      node.type = 'button';
      node.appendChild(el('span', 'draft-rarity', RARITY_LABEL[card.rarity]));
      node.appendChild(el('span', 'draft-name', card.name));
      node.appendChild(el('span', 'draft-desc', card.description));
      node.addEventListener('click', () => {
        // Ohne diese Sperre könnten zwei schnelle Berührungen zwei Karten
        // einlösen — die Runde bekäme zwei Aufwertungen für einen Zug.
        if (picked) return;
        picked = true;
        this.layer.root.classList.add('resolved');
        node.classList.add('chosen');
        onPick(card);
      });
      row.appendChild(node);

      this.timers.push(
        window.setTimeout(() => node.classList.add('revealed'), 90 + index * 130),
      );
    });
  }

  dispose(): void {
    for (const timer of this.timers) window.clearTimeout(timer);
    this.timers.length = 0;
    this.layer.dispose();
  }
}
