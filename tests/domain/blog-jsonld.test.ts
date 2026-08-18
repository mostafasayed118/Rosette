import { describe, expect, it } from 'vitest';
import { buildBlogPostingJsonLd } from '@/features/seo/blog-jsonld';

describe('blog JSON-LD', () => {
  const post = {
    slug: 'keep-roses-fresh',
    title: '5 tips for keeping roses fresh longer',
    excerpt: 'Cut stems, fresh water, cool corners.',
    contentEn: '<p>Body</p>',
    publishedAt: '2026-08-12T10:00:00.000Z',
    updatedAt: '2026-08-12T10:00:00.000Z',
  };

  it('builds a BlogPosting with canonical url and headline', () => {
    const ld = buildBlogPostingJsonLd({ post, url: 'https://rosette.fly.dev/en/cairo/blog/keep-roses-fresh' });
    expect(ld['@type']).toBe('BlogPosting');
    expect(ld.headline).toBe('5 tips for keeping roses fresh longer');
    expect(ld.url).toBe('https://rosette.fly.dev/en/cairo/blog/keep-roses-fresh');
    expect(ld.datePublished).toBe('2026-08-12T10:00:00.000Z');
    expect(ld.dateModified).toBe('2026-08-12T10:00:00.000Z');
    expect(ld.description).toBe('Cut stems, fresh water, cool corners.');
  });

  it('falls back to updatedAt when publishedAt is missing', () => {
    const ld = buildBlogPostingJsonLd({ post: { ...post, publishedAt: null }, url: 'https://rosette.fly.dev/en/cairo/blog/x' });
    expect(ld.datePublished).toBe('2026-08-12T10:00:00.000Z');
  });
});
