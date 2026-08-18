import { describe, expect, it } from 'vitest';
import { ratingBySlug } from '@/features/reviews/aggregate';

describe('ratingBySlug', () => {
  it('averages approved rows per slug, rounded to one decimal', () => {
    const map = ratingBySlug([
      { product_slug: 'rose-hour', rating: 5, status: 'approved' },
      { product_slug: 'rose-hour', rating: 4, status: 'approved' },
      { product_slug: 'rose-hour', rating: 2, status: 'pending' },
      { product_slug: 'green-morning', rating: 3, status: 'approved' },
    ]);
    expect(map.get('rose-hour')).toEqual({ average: 4.5, count: 2 });
    expect(map.get('green-morning')).toEqual({ average: 3, count: 1 });
  });

  it('ignores pending rows and rows without a slug', () => {
    const map = ratingBySlug([
      { product_slug: 'rose-hour', rating: 5, status: 'pending' },
      { product_slug: null, rating: 4, status: 'approved' },
    ]);
    expect(map.size).toBe(0);
  });
});
