'use client';

import Link from 'next/link';
import { CardContent } from '@/components/ui/card';
import { ProductVisual } from '@/components/ui/ProductVisual';
import { WishlistHeart } from '@/components/wishlist/WishlistHeart';
import { useI18n } from '@/features/i18n/I18nProvider';
import { useStorePath } from '@/features/i18n/use-store-path';
import { pickLocalized } from '@/features/i18n/pick';
import { formatMoney } from '@/features/money';
import { categoryMessageKeys } from './catalog-labels';
import type { Product } from './types';

type ProductCardProps = {
  product: Product;
  aspectClass?: string;
  statusPill?: { label: string; variant: 'sage' | 'neutral' } | null;
  imageClassName?: string;
};

export function ProductCard({ product, aspectClass = 'aspect-[3/4]', statusPill, imageClassName }: ProductCardProps) {
  const { locale, t } = useI18n();
  const { href } = useStorePath();
  const name = pickLocalized(locale, { en: product.name, ar: product.nameAr, fr: product.nameFr });
  const description = pickLocalized(locale, { en: product.description, ar: product.descriptionAr, fr: product.descriptionFr });
  const delivery = product.delivery.startsWith('Same-day') ? t('sameDay') : t('nextDay');
  const badgeLabel = product.delivery.startsWith('Same-day') ? 'Same-Day' : 'Next-Day';
  return (
    <article className="product-card group cursor-pointer">
      <div className="relative overflow-hidden rounded-lg border border-outline-variant/30 bg-surface-container ambient-glow">
        <Link href={href(`/shop/${product.slug}`)} className={`block overflow-hidden ${aspectClass}`}>
          <ProductVisual
            compact
            tone={product.tone}
            imageUrl={product.imageUrl}
            label={`${name} visual`}
            className={`h-full w-full transition-transform duration-700 group-hover:scale-105 ${statusPill?.variant === 'neutral' ? 'grayscale opacity-80' : ''} ${imageClassName ?? ''}`}
          />
        </Link>
        <span className="pointer-events-none absolute left-3 top-3 rounded-full border border-surface-variant bg-surface-container/90 px-3 py-1 text-[10px] font-medium uppercase tracking-widest text-tertiary backdrop-blur-sm">{badgeLabel}</span>
        <WishlistHeart slug={product.slug} className="absolute right-3 top-3" />
        {statusPill ? (
          <span
            className={`pointer-events-none absolute bottom-3 left-3 inline-flex items-center rounded-full border px-3 py-1 font-mono text-[11px] font-medium tracking-widest shadow-sm backdrop-blur-sm ${
              statusPill.variant === 'sage'
                ? 'border-secondary-fixed/50 bg-secondary-container text-on-secondary-container'
                : 'border-outline-variant/50 bg-surface-variant text-on-surface-variant'
            }`}
          >
            {statusPill.label}
          </span>
        ) : null}
      </div>
      <Link href={href(`/shop/${product.slug}`)} className="mt-3 flex items-start justify-between gap-3">
        <span>
          <span className="block text-xs font-bold uppercase tracking-[0.12em] text-sage">{t(categoryMessageKeys[product.category] ?? 'category')}</span>
          <span className="mt-1 block font-display text-[22px] leading-tight text-on-surface group-hover:text-primary">{name}</span>
          <span className="mt-1 block max-w-[22ch] text-sm leading-snug text-on-surface-variant">{description}</span>
          <span className="mt-1 block text-xs text-muted-foreground">{delivery}</span>
        </span>
        <span className="price shrink-0 text-sm font-medium text-on-surface">{t('from')} {formatMoney(product.price, locale)}</span>
      </Link>
      {product.rating && product.rating.count > 0 ? <span className="mt-1 block text-xs text-muted-foreground">★ {product.rating.average.toFixed(1)} · {product.rating.count}</span> : null}
    </article>
  );
}
