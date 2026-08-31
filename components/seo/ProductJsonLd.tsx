import type { Product } from '@/features/catalog/types';
import { buildProductJsonLd, type JsonLdReview } from '@/features/seo/product-jsonld';
import { serializeJsonLd } from '@/lib/sanitize-html';

export function ProductJsonLd({ product, reviews }: { product: Product; reviews?: JsonLdReview[] }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(buildProductJsonLd(product, reviews)) }} />;
}
