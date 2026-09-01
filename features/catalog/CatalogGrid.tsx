import Link from 'next/link';
import { StatusMessage } from '@/components/ui/status-message';
import { translate } from '@/features/i18n/translate';
import type { Locale } from '@/features/i18n/types';
import { CATALOG_CARD_SIZES, EDITORIAL_STAGGER_CLASS, ProductCard } from './ProductCard';
import type { Product } from './types';

const ASPECTS = ['aspect-[4/5]', 'aspect-square', 'aspect-[4/5]'] as const;

/**
 * Server component. `locale` and `href` are supplied by the server page so the
 * whole grid renders without shipping its markup or translation lookups to the
 * client; only the `WishlistHeart` island inside each card hydrates.
 */
export function CatalogGrid({ products, locale, href }: { products: Product[]; locale: Locale; href: (path: string) => string }) {
  const t = (key: string, values?: Record<string, string | number>) => translate(locale, key, values);
  if (products.length === 0) return <StatusMessage title={t('emptyTitle')}>{t('emptyHint')} <Link className="text-primary underline underline-offset-4" href={href('/shop')}>{t('resetCollection')}</Link>.</StatusMessage>;
  return (
    <div className="grid grid-cols-1 items-start gap-10 md:grid-cols-2 md:gap-12 lg:grid-cols-3">
      {products.map((product, index) => (
        <ProductCard
          key={product.slug}
          product={product}
          locale={locale}
          href={href}
          aspectClass={ASPECTS[index % 3]}
          sizes={CATALOG_CARD_SIZES}
          // Short result sets should optimize for comparison; reserve the
          // editorial stagger for collections with enough cards to sustain it.
          className={products.length >= 5 && index % 3 === 1 ? EDITORIAL_STAGGER_CLASS : ''}
        />
      ))}
    </div>
  );
}
