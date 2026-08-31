'use client';

import Link from 'next/link';
import { ProductVisual } from '@/components/ui/ProductVisual';
import { WishlistHeart } from '@/components/wishlist/WishlistHeart';
import { useI18n } from '@/features/i18n/I18nProvider';
import { useStorePath } from '@/features/i18n/use-store-path';
import { pickLocalized } from '@/features/i18n/pick';
import { formatMoney } from '@/features/money';
import type { Product } from './types';

type ProductCardProps = {
  product: Product;
  aspectClass?: string;
  statusPill?: { label: string; variant: 'sage' | 'neutral' } | null;
  imageClassName?: string;
  className?: string;
};

export function ProductCard({ product, aspectClass = 'aspect-[3/4]', statusPill, imageClassName, className = '' }: ProductCardProps) {
  const { locale, t } = useI18n();
  const { href } = useStorePath();
  const name = pickLocalized(locale, { en: product.name, ar: product.nameAr, fr: product.nameFr });
  const description = pickLocalized(locale, { en: product.description, ar: product.descriptionAr, fr: product.descriptionFr });
  const badgeLabel = product.delivery.startsWith('Same-day') ? t('pillSameDay') : t('pillNextDay');
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
          <span className="mt-2 block text-sm font-medium text-sage-ink">{product.delivery.startsWith('Same-day') ? t('sameDay') : t('nextDay')}</span>
        </span>
        <span className="price shrink-0 text-base font-semibold text-on-surface">{t('from')} {formatMoney(product.price, locale)}</span>
      </Link>
      {product.rating && product.rating.count > 0 ? <span className="mt-1 block text-xs text-muted-foreground">★ {product.rating.average.toFixed(1)} · {product.rating.count}</span> : null}
    </article>
  );
}
