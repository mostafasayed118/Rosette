#!/usr/bin/env node
/**
 * WCAG 2.1 contrast gate for the Rosette design tokens.
 *
 * Parses the light and dark palettes out of app/globals.css and asserts every
 * token that must be legible clears its threshold against every surface it can
 * be painted on:
 *   - text tokens        -> 4.5:1   (SC 1.4.3 Contrast Minimum)
 *   - structural borders -> 3.0:1   (SC 1.4.11 Non-text Contrast)
 *
 * Exits 1 with a table of failures. Wired into `npm run lint` via
 * `npm run check:contrast` so a regression fails CI.
 *
 * Why this exists: contrast failures are silent. Nothing throws, no test fails,
 * the page renders correctly. The defect is only visible to the users the rule
 * was written to protect, which is exactly why it needs an automated gate.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export { contrast } from './lib/contrast.mjs';
export { auditTokens, LIGHT_RULES, DARK_RULES, LIGHT_SURFACES, DARK_SURFACES } from './lib/contrast-rules.mjs';

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  const { runAudit } = await import('./lib/contrast-rules.mjs');
  process.exit(runAudit(readFileSync(resolve(root, 'app/globals.css'), 'utf8')));
}
