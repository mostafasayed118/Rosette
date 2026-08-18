import { describe, expect, it } from 'vitest';
import { resolveHtmlAttributes } from '@/features/i18n/server-html';

// The root layout wires next/font variables + cookie-derived html attributes
// (verified live via SSR in Task 6). This test covers the pure logic:
// the font-variable classes are asserted by ThemeTokens/theme tests and the
// attribute derivation is unit-tested here.
describe('RootLayout html attributes', () => {
  it('defaults to en/ltr/light without cookies', () => {
    expect(resolveHtmlAttributes(undefined, undefined)).toEqual({ lang: 'en', dir: 'ltr', themeClass: '' });
  });

  it('renders rtl/ar from the locale cookie', () => {
    expect(resolveHtmlAttributes('ar', undefined)).toEqual({ lang: 'ar', dir: 'rtl', themeClass: '' });
  });

  it('applies the dark theme class from the theme cookie', () => {
    expect(resolveHtmlAttributes(undefined, 'dark')).toEqual({ lang: 'en', dir: 'ltr', themeClass: ' dark' });
  });

  it('maps fr to fr/ltr', () => {
    expect(resolveHtmlAttributes('fr', undefined)).toEqual({ lang: 'fr', dir: 'ltr', themeClass: '' });
  });

  it('ignores unknown locale values', () => {
    expect(resolveHtmlAttributes('xx', 'blue').lang).toBe('en');
    expect(resolveHtmlAttributes('xx', 'blue').dir).toBe('ltr');
    expect(resolveHtmlAttributes('xx', 'blue').themeClass).toBe('');
  });
});
