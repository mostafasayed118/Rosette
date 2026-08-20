import type { Product } from '@/features/catalog/types';
import { buildProductJsonLd, type JsonLdReview } from '@/features/seo/product-jsonld';

export function ProductJsonLd({ product, reviews }: { product: Product; reviews?: JsonLdReview[] }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(buildProductJsonLd(product, reviews)) }} />;
}
