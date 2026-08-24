import type { RunResult } from '../core/Types';
import { UiLayer, button, el } from './dom';
import { formatCompact, formatDuration } from '../util/format';

export interface ResultsOptions {
  result: RunResult;
  /** Zusätzlich verdiente Tech Parts. */
  techParts: number;
  onContinue: () => void;
  onRetry: () => void;
}

export function createResultsScreen(parent: HTMLElement, options: ResultsOptions): UiLayer {
  const { result } = options;
  const layer = new UiLayer(parent, 'results');

  // Eine überstandene Runde verdient ein eigenes Wort — „Sektor gesichert"
  // klingt nach Zwischenstand, nicht nach Abschluss.
  layer.add(el('div', 'results-title', result.victory ? 'MISSION COMPLETE' : 'OVERRUN'));
  layer.add(el('div', 'results-score', formatCompact(result.score)));

  const rows: Array<[string, string]> = [
    ['Sectors cleared', String(result.stats.sectorsCleared)],
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

  const actions = layer.add(el('div', 'results-actions'));
  actions.appendChild(button('Retry', options.onRetry, 'secondary'));
  actions.appendChild(button('Continue', options.onContinue, 'primary'));

  return layer;
}
