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

  it('emits aggregateRating when the product has reviews', () => {
    const json = buildProductJsonLd({ ...product, rating: { average: 4.8, count: 12 } });
    expect(json.aggregateRating).toEqual({ '@type': 'AggregateRating', ratingValue: 4.8, reviewCount: 12 });
  });

  it('omits aggregateRating when there are no reviews', () => {
    const json = buildProductJsonLd(product);
    expect('aggregateRating' in json).toBe(false);
  });

  it('emits up to 10 review nodes with author, rating, body and date', () => {
    const reviews = Array.from({ length: 11 }, (_, i) => ({ rating: 5, body: `Body ${i}`, createdAt: `2026-08-0${(i % 9) + 1}T00:00:00Z`, displayName: `Person ${i}` }));
    const json = buildProductJsonLd(product, reviews);
    expect(Array.isArray(json.review)).toBe(true);
    expect(json.review!).toHaveLength(10);
    expect(json.review![0]).toEqual({
      '@type': 'Review',
      author: { '@type': 'Person', name: 'Person 0' },
      reviewRating: { '@type': 'Rating', ratingValue: 5 },
      reviewBody: 'Body 0',
      datePublished: '2026-08-01T00:00:00Z',
    });
  });

  it('omits the review array when no reviews are passed', () => {
    const json = buildProductJsonLd(product);
    expect('review' in json).toBe(false);
  });

  it('includes review photo URLs as the schema image field', () => {
    const json = buildProductJsonLd(product, [{
      rating: 5,
      body: 'Beautiful arrangement',
      createdAt: '2026-08-01T00:00:00Z',
      photos: ['https://img.example.com/review-1.jpg', 'https://img.example.com/review-2.jpg'],
    }]);
    expect(json.review![0]!.image).toEqual([
      'https://img.example.com/review-1.jpg',
      'https://img.example.com/review-2.jpg',
    ]);
  });

  it('omits the review image when no photos are present', () => {
    const json = buildProductJsonLd(product, [{ rating: 4, body: 'ok', createdAt: '2026-08-01T00:00:00Z' }]);
    expect('image' in json.review![0]!).toBe(false);
  });

  it('omits the author name when a review has no display name', () => {
    const json = buildProductJsonLd(product, [{ rating: 4, body: 'ok', createdAt: '2026-08-01T00:00:00Z', displayName: null }]);
    expect(json.review![0]!.author).toEqual({ '@type': 'Person' });
  });
});
