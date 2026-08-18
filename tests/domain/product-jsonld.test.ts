import { describe, expect, it } from 'vitest';
import { buildProductJsonLd } from '@/features/seo/product-jsonld';
import type { Product } from '@/features/catalog/types';

const product: Product = {
  slug: 'rose-hour',
  name: 'Rose Hour',
  description: 'A fresh bouquet.',
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

describe('buildProductJsonLd', () => {
  it('builds a Product offer with an EGP price', () => {
    const json = buildProductJsonLd(product);
    expect(json['@type']).toBe('Product');
    expect(json.name).toBe('Rose Hour');
    expect(json.offers.priceCurrency).toBe('EGP');
    expect(json.offers.price).toBe('21.22');
    expect(json.offers.availability).toBe('https://schema.org/InStock');
  });
});
