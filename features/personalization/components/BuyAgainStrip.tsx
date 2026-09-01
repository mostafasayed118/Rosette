'use client';

import { useEffect } from 'react';
import { ProductCard } from '@/features/catalog/ProductCard';
import { useI18n } from '@/features/i18n/I18nProvider';
import { useStorePath } from '@/features/i18n/use-store-path';
import type { Product } from '@/features/catalog/types';
import type { Locale } from '@/features/i18n/types';
import { trackPersonalization } from '@/features/personalization/analytics';

type BuyAgainStripProps = {
  products: Product[];
  /** Optional overrides; when omitted the component derives them from router context. */
  locale?: Locale;
  href?: (path: string) => string;
};

export function BuyAgainStrip({ products, locale: localeProp, href: hrefProp }: BuyAgainStripProps) {
  const { t, locale: localeFromContext } = useI18n();
  const { href: hrefFromContext } = useStorePath();
  const locale = localeProp ?? localeFromContext;
  const href = hrefProp ?? hrefFromContext;
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
            <ProductCard product={product} locale={locale} href={href} sizes="(min-width: 1024px) 25vw, (min-width: 640px) 40vw, 70vw" />
          </div>
        ))}
      </div>
    </section>
  );
}
