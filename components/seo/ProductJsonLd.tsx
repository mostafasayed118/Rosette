import type { Product } from '@/features/catalog/types';
import { buildProductJsonLd } from '@/features/seo/product-jsonld';

export function ProductJsonLd({ product }: { product: Product }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(buildProductJsonLd(product)) }} />;
}
