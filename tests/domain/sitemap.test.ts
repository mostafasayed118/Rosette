import { describe, expect, it } from 'vitest';
import { buildSitemapEntries } from '@/features/seo/sitemap';

describe('buildSitemapEntries', () => {
  it('enumerates locale x city x product URLs', () => {
    const entries = buildSitemapEntries({
      base: 'https://shop.example.com/',
      locales: ['en', 'ar'],
      cities: ['greater-cairo', 'alexandria'],
      products: [{ slug: 'rose-hour' }],
    });
    expect(entries).toHaveLength(2 * 2 * 5); // (home + shop + blog + delivery + 1 product) per locale+city
    expect(entries[0]?.url).toBe('https://shop.example.com/en/greater-cairo');
    expect(entries.some((e) => e.url === 'https://shop.example.com/ar/alexandria/shop/rose-hour')).toBe(true);
    expect(entries.some((e) => e.url === 'https://shop.example.com/en/greater-cairo/blog')).toBe(true);
    expect(entries.some((e) => e.url === 'https://shop.example.com/en/greater-cairo/delivery')).toBe(true);
  });

  it('adds blog post URLs when provided', () => {
    const entries = buildSitemapEntries({
      base: 'https://shop.example.com',
      locales: ['en'],
      cities: ['cairo'],
      products: [],
      blogPosts: [{ slug: 'keep-roses-fresh' }],
    });
    expect(entries.some((e) => e.url === 'https://shop.example.com/en/cairo/blog/keep-roses-fresh')).toBe(true);
  });

  it('strips a trailing slash from the base', () => {
    const entries = buildSitemapEntries({ base: 'https://shop.example.com/', locales: ['en'], cities: ['greater-cairo'], products: [] });
    expect(entries[0]?.url).toBe('https://shop.example.com/en/greater-cairo');
  });
});
