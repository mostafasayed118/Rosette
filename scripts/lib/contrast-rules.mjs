/**
 * The rule table for the Rosette contrast audit, plus the reporter.
 *
 * Kept separate from the maths so the rule set can be read, reviewed, and
 * extended without touching colour-space code.
 */

import { contrast, round, extractTokens } from './contrast.mjs';

/**
 * Surfaces each token can legitimately be painted on. A token must clear its
 * threshold against ALL of them — the weakest pairing is what a real user sees.
 */
export const LIGHT_SURFACES = { canvas: '#fdf6f0', surface: '#ffffff', 'surface-muted': '#f4ede6' };
export const DARK_SURFACES = { canvas: '#1a211e', surface: '#232a26', 'surface-muted': '#2c3530' };

/**
 * [token, minimum ratio, kind]
 *   4.5 = SC 1.4.3 Contrast (Minimum)        — text
 *   3.0 = SC 1.4.11 Non-text Contrast        — borders that identify a control
 *
 * Every border in this table is held to 3:1 with no carve-outs. WCAG 1.4.11 does
 * exempt purely decorative borders, but these tokens are used on inputs, selects,
 * checkboxes and radio buttons where the border IS the affordance, and the same
 * token is reused for card hairlines. Keeping one strict threshold means the gate
 * has no exemptions to argue about and no way to silently drift.
 */
/**
 * Note the `-token` suffixes on success/warning/primary-foreground. Those three
 * are declared per-theme in :root / :root.dark and referenced from `@theme inline`
 * as `var(--color-success-token)`. They cannot keep the bare name: a literal in
 * `@theme inline` is substituted directly into the utility, which freezes
 * `.text-success` to the light value in dark mode. The suffix keeps the palette
 * definition as the single source of truth and makes the reference order-independent.
 */
const TEXT_TOKENS = [
  ['--color-ink', 4.5, 'text'],
  ['--color-ink-muted', 4.5, 'text'],
  ['--color-brand', 4.5, 'text'],
  ['--color-accent', 4.5, 'text'],
  ['--color-success-token', 4.5, 'text'],
  ['--color-warning-token', 4.5, 'text'],
  ['--color-danger', 4.5, 'text'],
];

const BORDER_TOKENS = [
  ['--color-border', 3.0, 'border'],
  ['--color-control-border', 3.0, 'border'],
  ['--rt-outline-variant', 3.0, 'border'],
  ['--rt-outline', 3.0, 'border'],
];

export const LIGHT_RULES = [...TEXT_TOKENS, ...BORDER_TOKENS];
export const DARK_RULES = [...TEXT_TOKENS, ...BORDER_TOKENS];

function evaluate(label, tokens, surfaces, rules) {
  const failures = [];
  for (const [token, min, kind] of rules) {
    const value = tokens[token];
    if (!value) {
      failures.push({ label, token, min, kind, value: '<missing>', worst: 0, against: '-' });
      continue;
    }
    let worst = Infinity;
    let against = '-';
    for (const [surfaceName, surfaceHex] of Object.entries(surfaces)) {
      const r = contrast(value, surfaceHex);
      if (r < worst) {
        worst = r;
        against = surfaceName;
      }
    }
    if (worst < min) failures.push({ label, token, min, kind, value, worst: round(worst), against });
  }
  return failures;
}

/** Pure: returns every failure. No printing, no exiting. */
export function auditTokens(css) {
  const { light, dark } = extractTokens(css);
  return [
    ...evaluate('light', light, LIGHT_SURFACES, LIGHT_RULES),
    ...evaluate('dark', dark, DARK_SURFACES, DARK_RULES),
  ];
}

/** CLI reporter. Returns a process exit code. */
export function runAudit(css) {
  const failures = auditTokens(css);
  if (!failures.length) {
    console.log('  light: all tokens pass');
    console.log('  dark:  all tokens pass');
    console.log('\n  Contrast audit passed.\n');
    return 0;
  }

  for (const label of ['light', 'dark']) {
    const group = failures.filter((f) => f.label === label);
    if (!group.length) {
      console.log(`  ${label}: all tokens pass`);
      continue;
    }
    console.log(`\n  ${label} — ${group.length} failing token(s):\n`);
    console.log('    ' + 'token'.padEnd(24) + 'value'.padEnd(11) + 'ratio'.padEnd(8) + 'needs'.padEnd(7) + 'vs');
    for (const f of group) {
      console.log(
        '    ' + f.token.padEnd(24) + String(f.value).padEnd(11) +
        (f.worst + ':1').padEnd(8) + (f.min + ':1').padEnd(7) + f.against,
      );
    }
  }
  console.log(`\n  ${failures.length} contrast failure(s). WCAG 2.1 SC 1.4.3 (text) / 1.4.11 (non-text).\n`);
  return 1;
}
