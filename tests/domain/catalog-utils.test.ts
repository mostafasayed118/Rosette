import { describe, expect, it } from 'vitest';
import type { Product } from '@/features/catalog/types';
import { filterProducts, parseCatalogQuery, serializeCatalogQuery, sortProducts } from '@/features/catalog/catalog-utils';

const products: Product[] = [
  { slug: 'rose-hour', name: 'Rose Hour', description: 'Soft pink roses', category: 'hand-bouquet', occasions: ['birthday'], price: 12000, tone: '#bc6d63', imageUrl: null, inventory: 5, delivery: 'Same-day', createdAt: '2026-01-02', variants: [], addOns: [] },
  { slug: 'green-morning', name: 'Green Morning', description: 'A leafy vase arrangement', category: 'vase-arrangement', occasions: ['thank-you'], price: 18000, tone: '#6f8b73', imageUrl: null, inventory: 2, delivery: 'Next-day', createdAt: '2026-03-02', variants: [], addOns: [] },
];

describe('catalog utilities', () => {
  it('filters by search and category', () => {
    expect(filterProducts(products, { search: 'rose', category: 'hand-bouquet' })).toHaveLength(1);
    expect(filterProducts(products, { search: 'rose', category: 'vase-arrangement' })).toHaveLength(0);
  });

  it('sorts products by ascending price', () => {
    expect(sortProducts(products, 'price-asc').map((product) => product.slug)).toEqual(['rose-hour', 'green-morning']);
  });

  it('round-trips catalog query parameters', () => {
    const query = { search: 'rose', category: 'hand-bouquet', sort: 'price-desc' as const };
    expect(parseCatalogQuery(new URLSearchParams(serializeCatalogQuery(query)))).toEqual(query);
  });
});
