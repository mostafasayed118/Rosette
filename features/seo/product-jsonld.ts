import type { Product } from '@/features/catalog/types';

export type JsonLdReview = { rating: number; body: string; createdAt: string; displayName?: string | null };

export function buildProductJsonLd(product: Product, reviews?: JsonLdReview[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: product.description,
    image: product.imageUrl ? [product.imageUrl] : undefined,
    sku: product.slug,
    offers: {
      '@type': 'Offer',
      priceCurrency: 'EGP',
      price: (product.price / 100).toFixed(2),
      availability: 'https://schema.org/InStock',
    },
    ...(product.rating && product.rating.count > 0
      ? { aggregateRating: { '@type': 'AggregateRating', ratingValue: product.rating.average, reviewCount: product.rating.count } }
      : {}),
    ...(reviews && reviews.length > 0
      ? {
          review: reviews.slice(0, 10).map((review) => ({
            '@type': 'Review',
            author: { '@type': 'Person', ...(review.displayName ? { name: review.displayName } : {}) },
            reviewRating: { '@type': 'Rating', ratingValue: review.rating },
            reviewBody: review.body,
            datePublished: review.createdAt,
          })),
        }
      : {}),
  };
}
