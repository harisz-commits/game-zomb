#!/usr/bin/env node
/**
 * Reports the production bundle against the YouTube Playables size budget.
 *
 * Run `npm run build && npm run size`.
 */
import { gzipSync } from 'node:zlib';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const DIST = 'dist';

const LIMITS = {
  initialBundleTarget: 15 * 1024 * 1024,
  initialBundleHard: 30 * 1024 * 1024,
  totalHard: 250 * 1024 * 1024,
  singleFileHard: 30 * 1024 * 1024,
  singleFileTarget: 512 * 1024,
};

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stats = statSync(full);
    if (stats.isDirectory()) out.push(...walk(full));
    else out.push({ path: full, size: stats.size });
  }
  return out;
}

function human(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`;
}

let files;
try {
  files = walk(DIST);
} catch {
  console.error(`No ${DIST}/ directory. Run "npm run build" first.`);
  process.exit(1);
}

files.sort((a, b) => b.size - a.size);

const total = files.reduce((sum, file) => sum + file.size, 0);
const gzipTotal = files.reduce((sum, file) => sum + gzipSync(readFileSync(file.path)).length, 0);

console.log('\nLAST LINE - bundle size report\n');
for (const file of files) {
  const gz = gzipSync(readFileSync(file.path)).length;
  const flag = file.size > LIMITS.singleFileTarget ? '  (> 512 KiB target)' : '';
  console.log(
    `  ${relative(DIST, file.path).padEnd(34)} ${human(file.size).padStart(11)}  gzip ${human(gz).padStart(10)}${flag}`,
  );
}

console.log('');
console.log(`  TOTAL${' '.repeat(31)}${human(total).padStart(11)}  gzip ${human(gzipTotal).padStart(10)}`);
console.log('');

const checks = [
  ['initial bundle < 15 MiB (target)', total < LIMITS.initialBundleTarget],
  ['initial bundle < 30 MiB (hard)', total < LIMITS.initialBundleHard],
  ['total < 250 MiB (hard)', total < LIMITS.totalHard],
  ['no single file > 30 MiB (hard)', files.every((f) => f.size < LIMITS.singleFileHard)],
  [
    'no single file > 512 KiB (soft target)',
    files.every((f) => f.size < LIMITS.singleFileTarget),
  ],
];

let hardFailed = false;
for (const [label, ok] of checks) {
  const soft = label.includes('soft');
  if (!ok && !soft) hardFailed = true;
  console.log(`  ${ok ? 'PASS' : soft ? 'WARN' : 'FAIL'}  ${label}`);
}
console.log('');

process.exit(hardFailed ? 1 : 0);
