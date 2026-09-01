import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
// @ts-expect-error - plain .mjs helper, no type declarations generated on purpose.
import { auditTokens } from '../../scripts/lib/contrast-rules.mjs';
// @ts-expect-error - plain .mjs helper, no type declarations generated on purpose.
import { contrast, extractTokens } from '../../scripts/lib/contrast.mjs';

const css = readFileSync('app/globals.css', 'utf8');

/**
 * Design-token contrast regression coverage.
 *
 * This is the test that was missing. Every token below can be changed to any
 * colour that renders fine and throws nothing — the only symptom is that users
 * with low vision cannot read the page. Nothing else in the suite catches that,
 * so it is asserted here directly from the real globals.css.
 */
describe('design token contrast', () => {
  it('meets WCAG 2.1 in both themes', () => {
    const failures = auditTokens(css);
    const described = failures.map(
      (f: { label: string; token: string; value: string; worst: number; min: number; against: string }) =>
        `${f.label} ${f.token} (${f.value}) is ${f.worst}:1 on ${f.against}, needs ${f.min}:1`,
    );
    expect(described).toEqual([]);
  });

  it('exposes both palettes for auditing', () => {
    const { light, dark } = extractTokens(css);
    expect(light['--color-canvas']).toBeDefined();
    expect(dark['--color-canvas']).toBeDefined();
    expect(light['--color-canvas']).not.toBe(dark['--color-canvas']);
  });

  it('computes contrast symmetrically and within the WCAG range', () => {
    // Same colour against itself is the floor; black on white is the ceiling.
    expect(contrast('#ffffff', '#ffffff')).toBeCloseTo(1, 5);
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(contrast('#ffffff', '#000000'), 5);
  });

  it('fails a known-bad pairing so the gate cannot silently pass everything', () => {
    // Guard against a broken audit that always returns no failures.
    expect(contrast('#ddbfc4', '#fdf6f0')).toBeLessThan(3);
  });
});
