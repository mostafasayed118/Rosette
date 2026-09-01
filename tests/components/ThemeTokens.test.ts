import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync('app/globals.css', 'utf8');

/** A `--token: #hex;` declaration. */
const TOKEN_LITERAL_RE = /(--[\w-]+)\s*:\s*(#[0-9a-fA-F]{3,8})\s*;/g;

/**
 * These assertions are deliberately structural, not value-based.
 *
 * They used to pin exact hex values (`--color-brand: #d96a8e`), which meant every
 * legitimate palette change broke this test for no reason, while a value change
 * that destroyed contrast passed silently. Both jobs now belong elsewhere:
 *   - structure/indirection  -> here
 *   - WCAG ratios per theme  -> scripts/check-contrast.mjs, run by `npm run lint`
 *     and covered by tests/unit/contrast-tokens.test.ts
 */
describe('theme tokens', () => {
  it('defines the fresh-florist light tokens in the theme', () => {
    expect(css).toContain('--color-primary: var(--color-brand)');
    expect(css).toContain('--color-background: var(--color-canvas)');
    expect(css).toContain('--color-sage: var(--color-accent)');
  });

  it('defines dark-mode tokens', () => {
    expect(css).toContain('.dark');
    expect(css).toContain('--color-canvas: #1a211e');
    expect(css).toContain('--color-destructive-foreground: #1a0f14');
    expect(css).toContain('color-scheme: dark');
  });

  it('keeps the per-locale font switch', () => {
    expect(css).toContain("html[lang='ar']");
    expect(css).toContain('--font-arabic');
  });

  /**
   * A literal inside `@theme inline` is substituted straight into the utility, so
   * `.border-border` would emit `border-color:#e0c2c7` and stay frozen on the
   * light value in dark mode. Any token that differs between :root and :root.dark
   * MUST therefore be declared in the theme block as a `var()` reference.
   */
  it('never hardcodes a colour in @theme inline that is also redefined per theme', () => {
    const start = css.indexOf('@theme inline');
    const themeBlock = css.slice(start, css.indexOf('}', start) + 1);

    const literals = new Map<string, string>();
    for (const [, name, value] of themeBlock.matchAll(TOKEN_LITERAL_RE)) {
      if (name && value) literals.set(name, value);
    }

    const grab = (marker: string) => {
      const at = css.indexOf(marker);
      const open = css.lastIndexOf('{', at);
      const close = css.indexOf('}', at);
      const out = new Map<string, string>();
      for (const [, name, value] of css.slice(open + 1, close).matchAll(TOKEN_LITERAL_RE)) {
        if (name && value) out.set(name, value);
      }
      return out;
    };
    const light = grab('--color-canvas: #fdf6f0');
    const dark = grab('--color-canvas: #1a211e');

    const frozen = [...literals.entries()].filter(([token, value]) => {
      const l = light.get(token);
      const d = dark.get(token);
      return (l !== undefined && l !== value) || (d !== undefined && d !== value);
    });

    expect(frozen.map(([token]) => token)).toEqual([]);
  });

  it('declares every border token used by form controls', () => {
    for (const token of ['--color-border', '--color-control-border', '--rt-outline-variant', '--rt-outline']) {
      expect(css).toContain(`${token}:`);
    }
    // Inputs must resolve to the control border, which the contrast gate holds to 3:1.
    expect(css).toContain('--color-input: var(--color-control-border)');
  });
});
