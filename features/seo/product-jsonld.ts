import type { Product } from '@/features/catalog/types';

export function buildProductJsonLd(product: Product) {
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
  };
}
