'use client';

import { useEffect } from 'react';
import { ProductCard } from '@/features/catalog/ProductCard';
import { useI18n } from '@/features/i18n/I18nProvider';
import type { Product } from '@/features/catalog/types';
import { trackPersonalization } from '@/features/personalization/analytics';

type BuyAgainStripProps = {
  products: Product[];
};

export function BuyAgainStrip({ products }: BuyAgainStripProps) {
  const { t } = useI18n();
  useEffect(() => {
    products.forEach((product) => trackPersonalization('personalization_impression', { productSlug: product.slug, surface: 'buy_again' }));
  }, [products]);
  if (!products.length) return null;
  const heading = t('personalizationBuyAgain');
  return (
    <section aria-label={heading} className="mb-8">
      <h2 className="font-display text-xl text-on-surface">{heading}</h2>
      <div className="relative mt-4 flex gap-4 overflow-x-auto pb-2 snap-x rtl:snap-x">
        {products.map((product) => (
          <div key={product.slug} className="min-w-64 shrink-0 snap-start">
            <ProductCard product={product} />
          </div>
        ))}
      </div>
    </section>
  );
}
