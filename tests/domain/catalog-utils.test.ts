import { describe, expect, it } from 'vitest';
import type { Product } from '@/features/catalog/types';
import { CATALOG_PER_PAGE, filterProducts, paginateProducts, parseCatalogQuery, serializeCatalogQuery, sortProducts } from '@/features/catalog/catalog-utils';

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

describe('catalog pagination', () => {
  const many: Product[] = Array.from({ length: 21 }, (_, index) => ({
    ...products[0]!,
    slug: `product-${index + 1}`,
    name: `Product ${index + 1}`,
  }));

  it('defaults to the first page with the configured page size', () => {
    const result = paginateProducts(many, undefined);
    expect(result.page).toBe(1);
    expect(result.perPage).toBe(CATALOG_PER_PAGE);
    expect(result.items).toHaveLength(CATALOG_PER_PAGE);
    expect(result.items[0]?.slug).toBe('product-1');
    expect(result.totalPages).toBe(Math.ceil(21 / CATALOG_PER_PAGE));
  });

  it('slices the requested page', () => {
    const result = paginateProducts(many, 2);
    expect(result.page).toBe(2);
    expect(result.items[0]?.slug).toBe(`product-${CATALOG_PER_PAGE + 1}`);
  });

  it('clamps pages beyond the last page', () => {
    const result = paginateProducts(many, 99);
    expect(result.page).toBe(result.totalPages);
    expect(result.items.length).toBeGreaterThan(0);
  });

  it('clamps pages below one and keeps at least one page when empty', () => {
    expect(paginateProducts(many, 0).page).toBe(1);
    expect(paginateProducts(many, -5).page).toBe(1);
    const empty = paginateProducts([], 3);
    expect(empty.page).toBe(1);
    expect(empty.totalPages).toBe(1);
    expect(empty.items).toEqual([]);
  });

  it('parses the page parameter and ignores invalid values', () => {
    expect(parseCatalogQuery(new URLSearchParams('page=3')).page).toBe(3);
    expect(parseCatalogQuery(new URLSearchParams('page=0')).page).toBeUndefined();
    expect(parseCatalogQuery(new URLSearchParams('page=abc')).page).toBeUndefined();
  });

  it('omits page=1 from serialized queries but keeps later pages', () => {
    expect(serializeCatalogQuery({ page: 1 })).toBe('');
    expect(serializeCatalogQuery({ category: 'hand-bouquet', page: 4 })).toBe('category=hand-bouquet&page=4');
  });
});
