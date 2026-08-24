import type { RunResult } from '../core/Types';
import { UiLayer, button, el } from './dom';
import { formatCompact, formatDuration } from '../util/format';

export interface ResultsOptions {
  result: RunResult;
  /** Zusätzlich verdiente Tech Parts. */
  techParts: number;
  /** Endlosmodus: War dieser Lauf tiefer als jeder bisherige? */
  newBestDepth: boolean;
  /**
   * Angebot, die Ausbeute per Werbung zu verdoppeln. Fehlt es, wird kein
   * Knopf gezeigt — das Spiel muss ohne Werbung vollständig sein.
   */
  onDoubleRewards?: () => Promise<boolean>;
  onContinue: () => void;
  onRetry: () => void;
}

export function createResultsScreen(parent: HTMLElement, options: ResultsOptions): UiLayer {
  const { result } = options;
  const layer = new UiLayer(parent, 'results');

  // Eine überstandene Runde verdient ein eigenes Wort — „Sektor gesichert"
  // klingt nach Zwischenstand, nicht nach Abschluss.
  // Im Endlosmodus gibt es kein Gewinnen — dort zählt, wie weit man kam.
  const title = result.mode === 'endless'
    ? `DEPTH ${result.stats.sectorsCleared}`
    : result.victory
      ? 'MISSION COMPLETE'
      : 'OVERRUN';
  layer.add(el('div', 'results-title', title));
  if (options.newBestDepth) {
    layer.add(el('div', 'results-record', 'NEW RECORD'));
  }
  layer.add(el('div', 'results-score', formatCompact(result.score)));

  const rows: Array<[string, string]> = [
    [
      result.mode === 'endless' ? 'Sectors survived' : 'Sectors cleared',
      String(result.stats.sectorsCleared),
    ],
    ['Zombies killed', formatCompact(result.stats.kills)],
    ['Bosses down', String(result.stats.bossesKilled)],
    ['Peak power', formatCompact(result.stats.peakCombatPower)],
    ['Time', formatDuration(result.stats.durationSeconds)],
  ];

  const table = layer.add(el('div', 'results-table'));
  for (const [label, value] of rows) {
    const row = el('div', 'results-row');
    row.appendChild(el('span', 'results-label', label));
    row.appendChild(el('span', 'results-value', value));
    table.appendChild(row);
  }

  // Die Ausbeute steht abgesetzt: Sie ist der Grund, gleich noch einmal zu
  // starten, und soll nicht zwischen den Statistikzeilen untergehen.
  const loot = layer.add(el('div', 'results-loot'));
  loot.appendChild(el('span', 'chip loot', `◎ +${formatCompact(result.stats.coinsEarned)}`));
  if (options.techParts > 0) {
    loot.appendChild(el('span', 'chip loot', `⚙ +${formatCompact(options.techParts)}`));
  }

  if (options.onDoubleRewards && result.stats.coinsEarned > 0) {
    const doubler = button('Double rewards', () => void run(), 'reward');
    doubler.appendChild(el('span', 'reward-tag', 'AD'));
    layer.add(doubler);

    async function run(): Promise<void> {
      // Sofort sperren: Ein zweiter Tipp waehrend der Einblendung wuerde die
      // Belohnung ein zweites Mal anfordern.
      doubler.disabled = true;
      doubler.textContent = '…';
      const granted = await options.onDoubleRewards!();
      if (granted) {
        doubler.textContent = 'Doubled!';
        doubler.classList.add('granted');
        for (const chip of loot.querySelectorAll('.chip')) chip.classList.add('doubled');
        loot.replaceChildren(
          el('span', 'chip loot doubled', `◎ +${formatCompact(result.stats.coinsEarned)}`),
          ...(options.techParts > 0
            ? [el('span', 'chip loot doubled', `⚙ +${formatCompact(options.techParts * 2)}`)]
            : []),
        );
      } else {
        // Kein Vorwurf, kein Fehlerdialog: Das Angebot verschwindet einfach.
        doubler.remove();
      }
    }
  }

  const actions = layer.add(el('div', 'results-actions'));
  actions.appendChild(button('Retry', options.onRetry, 'secondary'));
  actions.appendChild(button('Continue', options.onContinue, 'primary'));

  return layer;
}
