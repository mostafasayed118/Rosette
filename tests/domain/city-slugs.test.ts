import { describe, expect, it } from 'vitest';
import { cities, getCity, getCityBySlug } from '@/features/destination/data';

describe('city slugs', () => {
  it('maps every slug back to its city', () => {
    for (const city of cities) {
      expect(getCityBySlug(city.slug)?.code).toBe(city.code);
    }
  });

  it('resolves short slugs like cairo', () => {
    expect(getCityBySlug('cairo')?.code).toBe('greater-cairo');
  });

  it('keeps codes resolvable for legacy URLs', () => {
    expect(getCity('greater-cairo')?.slug).toBe('cairo');
  });

  it('has unique slugs', () => {
    const slugs = cities.map((c) => c.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});
