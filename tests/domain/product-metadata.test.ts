import { describe, expect, it } from 'vitest';
import { buildProductMetadata } from '@/features/seo/product-metadata';
import type { Product } from '@/features/catalog/types';

const product: Product = {
  slug: 'rose-hour',
  name: 'Rose Hour',
  nameAr: 'ساعة الورد',
  nameFr: 'Heure de Rose',
  description: 'A fresh bouquet.',
  descriptionAr: 'باقة طازجة.',
  descriptionFr: 'Un bouquet frais.',
  category: 'bouquets',
  occasions: [],
  price: 2122,
  tone: '#000000',
  imageUrl: 'https://img.example.com/x.jpg',
  inventory: 10,
  delivery: 'Same-day',
  createdAt: '2026-08-18',
  variants: [],
  addOns: [],
};

describe('buildProductMetadata', () => {
  it('uses localized title and description', () => {
    const meta = buildProductMetadata({ product, locale: 'ar', city: 'greater-cairo', base: 'https://s.example.com' });
    expect(meta.title).toBe('ساعة الورد');
    expect(meta.description).toBe('باقة طازجة.');
  });

  it('sets canonical + hreflang for all locales', () => {
    const meta = buildProductMetadata({ product, locale: 'en', city: 'greater-cairo', base: 'https://s.example.com' });
    expect(meta.alternates?.canonical).toBe('https://s.example.com/en/greater-cairo/shop/rose-hour');
    const languages = meta.alternates?.languages as Record<string, string>;
    expect(languages).toEqual({
      en: 'https://s.example.com/en/greater-cairo/shop/rose-hour',
      ar: 'https://s.example.com/ar/greater-cairo/shop/rose-hour',
      fr: 'https://s.example.com/fr/greater-cairo/shop/rose-hour',
    });
  });

  it('includes the og image when present', () => {
    const meta = buildProductMetadata({ product, locale: 'en', city: 'greater-cairo', base: 'https://s.example.com' });
    expect(meta.openGraph?.images).toEqual([{ url: 'https://img.example.com/x.jpg' }]);
  });
});
