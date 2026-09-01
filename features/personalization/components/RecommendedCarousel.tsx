'use client';

import { useEffect } from 'react';
import { ProductCard } from '@/features/catalog/ProductCard';
import { useI18n } from '@/features/i18n/I18nProvider';
import { useStorePath } from '@/features/i18n/use-store-path';
import type { Product } from '@/features/catalog/types';
import type { Locale } from '@/features/i18n/types';
import { trackPersonalization } from '@/features/personalization/analytics';

type RecommendedCarouselProps = {
  products: Product[];
  /** Optional overrides; when omitted the component derives them from router context. */
  locale?: Locale;
  href?: (path: string) => string;
  category?: string;
};

export function RecommendedCarousel({ products, locale: localeProp, href: hrefProp, category }: RecommendedCarouselProps) {
  const { t, locale: localeFromContext } = useI18n();
  const { href: hrefFromContext } = useStorePath();
  const locale = localeProp ?? localeFromContext;
  const href = hrefProp ?? hrefFromContext;
  useEffect(() => {
    products.forEach((product) => trackPersonalization('personalization_impression', { productSlug: product.slug, surface: 'recommended' }));
  }, [products]);
  if (!products.length) return null;
  const heading = t('personalizationRecommended');
  const hint = category ? t('personalizationBecause', { category }) : null;
  const ariaLabel = hint ? `${heading} — ${hint}` : heading;
  return (
    <section aria-label={ariaLabel} className="mb-8">
      <h2 className="font-display text-xl text-on-surface">{heading}</h2>
      {hint ? <p className="mt-1 text-sm text-on-surface-variant">{hint}</p> : null}
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
