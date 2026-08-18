import { describe, expect, it } from 'vitest';
import { buildLocalizedPageMetadata } from '@/features/seo/page-metadata';

describe('buildLocalizedPageMetadata', () => {
  it('builds canonical + hreflang for a page path', () => {
    const meta = buildLocalizedPageMetadata({ locale: 'en', city: 'greater-cairo', path: '/shop', base: 'https://s.example.com', title: 'Collection', description: 'Browse.' });
    expect(meta.alternates?.canonical).toBe('https://s.example.com/en/greater-cairo/shop');
    const languages = meta.alternates?.languages as Record<string, string>;
    expect(languages).toEqual({
      en: 'https://s.example.com/en/greater-cairo/shop',
      ar: 'https://s.example.com/ar/greater-cairo/shop',
      fr: 'https://s.example.com/fr/greater-cairo/shop',
    });
    expect(meta.title).toBe('Collection');
  });

  it('handles the city home path', () => {
    const meta = buildLocalizedPageMetadata({ locale: 'ar', city: 'alexandria', path: '', base: 'https://s.example.com/' });
    expect(meta.alternates?.canonical).toBe('https://s.example.com/ar/alexandria');
  });
});
