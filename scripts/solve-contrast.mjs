#!/usr/bin/env node
/**
 * Dev utility. For each failing token, print the nearest hue-preserving value
 * that clears its WCAG threshold. Hue and saturation are held so the palette
 * still looks like itself; only lightness moves.
 *
 * Run it, then copy the hex values into app/globals.css. Not part of CI — it
 * proposes, it does not write.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { contrast, round, solveForContrast } from './lib/contrast.mjs';
import { auditTokens, LIGHT_SURFACES, DARK_SURFACES } from './lib/contrast-rules.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const css = readFileSync(resolve(root, 'app/globals.css'), 'utf8');
const failures = auditTokens(css);

if (!failures.length) {
  console.log('\n  All tokens already pass. Nothing to solve.\n');
  process.exit(0);
}

// Light theme sits on light surfaces, so darken. Dark theme: lighten.
const surfacesFor = (label) => (label === 'light' ? LIGHT_SURFACES : DARK_SURFACES);
const directionFor = (label) => (label === 'light' ? -1 : 1);

console.log('\n  Proposed fixes:\n');
console.log('    ' + 'theme  token'.padEnd(34) + 'from'.padEnd(11) + 'to'.padEnd(11) + 'ratio');

const proposals = [];
for (const f of failures) {
  if (f.value === '<missing>') {
    console.log(`    ${(f.label + '  ' + f.token).padEnd(34)} <missing> — add the token to globals.css`);
    continue;
  }
  const fix = solveForContrast(f.value, surfacesFor(f.label), f.min, directionFor(f.label));
  if (!fix) {
    console.log(`    ${(f.label + '  ' + f.token).padEnd(34)} ${f.value} — no solution on this hue`);
    continue;
  }
  const worst = round(Math.min(...Object.values(surfacesFor(f.label)).map((s) => contrast(fix, s))));
  proposals.push({ ...f, fix });
  console.log(`    ${(f.label + '  ' + f.token).padEnd(34)}${f.value.padEnd(11)}${fix.padEnd(11)}${worst}:1`);
}

console.log('\n  Apply to app/globals.css:\n');
for (const [label, group] of [
  [':root (light)', proposals.filter((p) => p.label === 'light')],
  [':root.dark', proposals.filter((p) => p.label === 'dark')],
]) {
  if (!group.length) continue;
  console.log(`    ${label}`);
  for (const p of group) console.log(`      ${p.token}: ${p.fix};   /* was ${p.value} */`);
}
console.log('');
