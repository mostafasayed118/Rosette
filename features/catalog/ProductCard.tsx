import Link from 'next/link';
import { ProductVisual } from '@/components/ui/ProductVisual';
import { WishlistHeart } from '@/components/wishlist/WishlistHeart';
import { pickLocalized } from '@/features/i18n/pick';
import { translate } from '@/features/i18n/translate';
import { formatMoney } from '@/features/money';
import type { Locale } from '@/features/i18n/types';
import type { Product } from './types';

/**
 * `sizes` tells `next/image` how wide the card actually is at each breakpoint,
 * so the browser downloads a sensibly-sized file instead of the `100vw` default.
 * The catalog grid is 1-up / 2-up / 3-up; narrower surfaces (carousels) override.
 */
export const CATALOG_CARD_SIZES = '(min-width: 1024px) 33vw, (min-width: 768px) 50vw, 100vw';
export const EDITORIAL_STAGGER_CLASS = 'lg:mt-16';

type ProductCardProps = {
  product: Product;
  /** Active locale — passed in so this file stays free of client hooks. */
  locale: Locale;
  /** Prefixes a storefront path with `/{locale}/{city}` (see `storeHref`). */
  href: (path: string) => string;
  aspectClass?: string;
  statusPill?: { label: string; variant: 'sage' | 'neutral' } | null;
  imageClassName?: string;
  className?: string;
  sizes?: string;
};

/**
 * Deliberately NOT a client component.
 *
 * `locale`/`href` are injected by the caller (server page via `storeHref`,
 * client island via `useStorePath`) so this renders on the server by default.
 * The only interactive part — `WishlistHeart` — remains a client island.
 *
 * Do not add `'use client'` here without also replacing the `href` function
 * prop: functions cannot cross the server → client serialization boundary.
 */
export function ProductCard({
  product,
  locale,
  href,
  aspectClass = 'aspect-[3/4]',
  statusPill,
  imageClassName,
  className = '',
  sizes = CATALOG_CARD_SIZES,
}: ProductCardProps) {
  const t = (key: string, values?: Record<string, string | number>) => translate(locale, key, values);
  const name = pickLocalized(locale, { en: product.name, ar: product.nameAr, fr: product.nameFr });
  const description = pickLocalized(locale, { en: product.description, ar: product.descriptionAr, fr: product.descriptionFr });
  const isSameDay = (product.deliveryTier ?? (product.delivery.trim().toLowerCase().startsWith('same-day') ? 'same_day' : 'next_day')) === 'same_day';
  const badgeLabel = isSameDay ? t('pillSameDay') : t('pillNextDay');
  const stockPill = product.inventory <= 0
    ? { label: t('soldOut'), variant: 'neutral' as const }
    : product.inventory <= 3
      ? { label: t('onlyLeft', { count: product.inventory }), variant: 'neutral' as const }
      : null;
  const visibleStatus = statusPill ?? stockPill;
  return (
    <article className={`product-card stagger-item group cursor-pointer ${className}`}>
      <div className="relative overflow-hidden rounded-[var(--radius-card)] border border-outline-variant/30 bg-surface-container ambient-glow">
        <Link href={href(`/shop/${product.slug}`)} className={`block overflow-hidden ${aspectClass}`}>
          <ProductVisual
            compact
            tone={product.tone}
            imageUrl={product.imageUrl}
            label={`${name} visual`}
            sizes={sizes}
            className={`h-full w-full transition-transform duration-700 group-hover:scale-[1.06] ${statusPill?.variant === 'neutral' ? 'grayscale opacity-80' : ''} ${imageClassName ?? ''}`}
          />
        </Link>
        <span className="pointer-events-none absolute start-3 top-3 rounded-full border border-surface-variant bg-surface-container/90 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-sage-ink backdrop-blur-md">{badgeLabel}</span>
        <WishlistHeart slug={product.slug} productName={name} className="absolute end-3 top-3" />
        {visibleStatus ? (
          <span
            className={`pointer-events-none absolute bottom-3 start-3 inline-flex items-center rounded-full border px-3 py-1 font-mono text-[11px] font-medium tracking-widest shadow-sm backdrop-blur-sm ${
              visibleStatus.variant === 'sage'
                ? 'border-secondary-fixed/50 bg-secondary-container text-on-secondary-container'
                : 'border-outline-variant/50 bg-surface-variant text-on-surface-variant'
            }`}
          >
            {visibleStatus.label}
          </span>
        ) : null}
      </div>
      <Link href={href(`/shop/${product.slug}`)} className="mt-4 flex items-start justify-between gap-4">
        <span className="min-w-0">
          <span className="block font-display text-[22px] leading-tight text-on-surface transition-colors group-hover:text-primary">{name}</span>
          <span className="mt-1 block line-clamp-2 text-sm leading-relaxed text-on-surface-variant">{description}</span>
          <span className="mt-2 block text-sm font-medium text-sage-ink">{isSameDay ? t('sameDay') : t('nextDay')}</span>
        </span>
        <span className="price shrink-0 text-base font-semibold text-on-surface">{t('from')} {formatMoney(product.price, locale)}</span>
      </Link>
      {product.rating && product.rating.count > 0 ? <span className="mt-1 block text-xs text-muted-foreground">★ {product.rating.average.toFixed(1)} · {product.rating.count}</span> : null}
    </article>
  );
}
