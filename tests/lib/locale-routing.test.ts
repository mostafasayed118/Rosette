import { describe, expect, it } from 'vitest';
import { LOCALES, resolveLocaleRouting } from '@/lib/locale-routing';

describe('resolveLocaleRouting', () => {
  it('redirects the root to /en', () => {
    expect(resolveLocaleRouting('/')).toEqual({ type: 'redirect', to: '/en' });
  });

  it('continues for a valid locale and reports it', () => {
    expect(resolveLocaleRouting('/en')).toEqual({ type: 'continue', locale: 'en' });
    expect(resolveLocaleRouting('/ar/greater-cairo/shop')).toEqual({ type: 'continue', locale: 'ar' });
    expect(resolveLocaleRouting('/fr/track')).toEqual({ type: 'continue', locale: 'fr' });
  });

  it('redirects an unknown first segment to the en path', () => {
    expect(resolveLocaleRouting('/es/greater-cairo')).toEqual({ type: 'redirect', to: '/en/es/greater-cairo' });
    expect(resolveLocaleRouting('/shop')).toEqual({ type: 'redirect', to: '/en/shop' });
  });

  it('exposes the three supported locales', () => {
    expect(LOCALES).toEqual(['en', 'ar', 'fr']);
  });
});
