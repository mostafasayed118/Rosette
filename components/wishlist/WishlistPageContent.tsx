'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { ProductCard } from '@/features/catalog/ProductCard';
import type { Product } from '@/features/catalog/types';
import { useI18n } from '@/features/i18n/I18nProvider';
import { useStorePath } from '@/features/i18n/use-store-path';
import { useWishlist } from '@/features/wishlist/WishlistProvider';
import { deferToTask } from '@/hooks/use-deferred-task';

const WISHLIST_ASPECTS = ['aspect-[4/5]', 'aspect-[16/10]', 'aspect-square', 'aspect-[3/4]'];

function WishlistMoveToBag({ product, disabled }: { product: Product; disabled?: boolean }) {
  const { t } = useI18n();
  const { href } = useStorePath();
  if (disabled) {
    return (
      <span className="mt-3 inline-flex items-center gap-2 border-b border-transparent pb-0.5 font-body text-sm text-on-surface-variant opacity-50">
        {t('unavailable')}
      </span>
    );
  }
  return (
    <Link
      href={href(`/shop/${product.slug}`)}
      className="group/btn mt-3 inline-flex items-center gap-2 self-start border-b border-on-surface pb-0.5 font-body text-sm text-on-surface transition-colors hover:border-primary hover:text-primary"
    >
      {t('moveToBag')}
      <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover/btn:translate-x-1" aria-hidden="true" />
    </Link>
  );
}

export function WishlistPageContent() {
  const { t } = useI18n();
  const { href } = useStorePath();
  const { ready, saved } = useWishlist();
  const [products, setProducts] = useState<Product[]>([]);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    if (!ready) return;
    if (saved.length === 0) {
      // Deferred clear keeps this out of the commit phase.
      deferToTask(() => setProducts([]));
      return;
    }
    (async () => {
      const response = await fetch(`/api/wishlist/products?slugs=${encodeURIComponent(saved.join(','))}`);
      if (!response.ok) {
        if (active) setError(true);
        return;
      }
      const body = (await response.json()) as { products?: Product[] };
      if (active) setProducts(body.products ?? []);
    })();
    return () => {
      active = false;
    };
  }, [ready, saved]);

  if (!ready) return null;

  const savedCount = products.length || saved.length;
  const eyebrow = t('wishlistEyebrow');
  const title = t('wishlistTitle');

  const getStatusPill = (product: Product): { label: string; variant: 'neutral' } | null => {
    // Only real inventory state earns a pill — never fabricate stock signals.
    if (product.inventory === 0) return { label: t('outOfStock'), variant: 'neutral' };
    return null;
  };

  const header = (
    <section className="flex flex-col gap-4 border-b border-outline-variant/30 pb-8 md:flex-row md:items-end md:justify-between">
      <div className="flex flex-col gap-2">
        <span className="font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-sage">{eyebrow}</span>
        <h1 className="font-display text-[clamp(2rem,4vw,3.75rem)] leading-[0.95] tracking-[-0.02em] text-on-surface">{title}</h1>
      </div>
      <div className="flex flex-col items-start gap-3 md:items-end">
        <span className="font-mono text-xs tracking-[0.08em] text-on-surface-variant">{t('savedCount', { count: savedCount })}</span>
      </div>
    </section>
  );

  if (saved.length === 0) {
    return (
      <div className="flex flex-col gap-8">
        {header}
        <div className="grid gap-2 py-16 text-center">
          <p className="font-display text-2xl text-on-surface">{t('wishlistEmpty')}</p>
          <p className="text-sm text-muted-foreground">{t('wishlistEmptyHint')}</p>
          <p>
            <Link className="text-sm text-primary underline underline-offset-4" href={href('/shop')}>
              {t('browseCollection')}
            </Link>
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col gap-8">
        {header}
        <p className="py-16 text-center text-sm text-destructive">{t('temporaryError')}</p>
      </div>
    );
  }

  // masonry like CatalogGrid: split into two columns for staggered editorial rhythm
  const col1 = products.filter((_, index) => index % 2 === 0);
  const col2 = products.filter((_, index) => index % 2 === 1);

  const renderColumn = (colProducts: Product[]) =>
    colProducts.map((product) => {
      const originalIndex = products.findIndex((p) => p.slug === product.slug);
      const aspect = WISHLIST_ASPECTS[originalIndex % WISHLIST_ASPECTS.length];
      const statusPill = getStatusPill(product);
      const isOutOfStock = product.inventory === 0;
      return (
        <div key={product.slug} className="flex flex-col gap-3">
          <ProductCard product={product} aspectClass={aspect} statusPill={statusPill} />
          <div className="px-1">
            <WishlistMoveToBag product={product} disabled={isOutOfStock} />
          </div>
        </div>
      );
    });

  return (
    <div className="flex flex-col gap-8">
      {header}
      <section className="grid grid-cols-1 items-start gap-8 md:grid-cols-2 md:gap-8">
        <div className="masonry-col-1 flex flex-col gap-8">{renderColumn(col1)}</div>
        <div className="masonry-col-2 flex flex-col gap-8 md:pt-8">{renderColumn(col2)}</div>
      </section>
    </div>
  );
}
