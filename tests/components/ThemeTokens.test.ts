import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync('app/globals.css', 'utf8');

describe('theme tokens', () => {
  it('defines the fresh-florist light tokens in the theme', () => {
    expect(css).toContain('--color-primary: var(--color-brand)');
    expect(css).toContain('--color-background: var(--color-canvas)');
    expect(css).toContain('--color-sage: var(--color-accent)');
  });
  it('defines dark-mode tokens', () => {
    expect(css).toContain('.dark');
    expect(css).toContain('--color-canvas: #1a211e');
    expect(css).toContain('--color-brand: #d96a8e');
  });
  it('keeps the per-locale font switch', () => {
    expect(css).toContain("html[lang='ar']");
    expect(css).toContain('--font-arabic');
  });
});
