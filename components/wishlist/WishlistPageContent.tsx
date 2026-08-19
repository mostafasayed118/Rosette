'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ProductCard } from '@/features/catalog/ProductCard';
import type { Product } from '@/features/catalog/types';
import { useI18n } from '@/features/i18n/I18nProvider';
import { useStorePath } from '@/features/i18n/use-store-path';
import { useWishlist } from '@/features/wishlist/WishlistProvider';

export function WishlistPageContent() {
  const { t } = useI18n();
  const { href } = useStorePath();
  const { ready, saved } = useWishlist();
  const [products, setProducts] = useState<Product[]>([]);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    if (!ready) return;
    if (saved.length === 0) { setProducts([]); return; }
    (async () => {
      const response = await fetch(`/api/wishlist/products?slugs=${encodeURIComponent(saved.join(','))}`);
      if (!response.ok) { if (active) setError(true); return; }
      const body = (await response.json()) as { products?: Product[] };
      if (active) setProducts(body.products ?? []);
    })();
    return () => { active = false; };
  }, [ready, saved]);

  if (!ready) return null;
  if (saved.length === 0) {
    return (
      <div className="grid gap-2 py-16 text-center">
        <p className="font-display text-2xl">{t('wishlistEmpty')}</p>
        <p className="text-sm text-muted-foreground">{t('wishlistEmptyHint')}</p>
        <p><Link className="text-primary underline underline-offset-4" href={href('/shop')}>{t('browseCollection')}</Link></p>
      </div>
    );
  }
  if (error) return <p className="py-16 text-center text-sm text-destructive">{t('temporaryError')}</p>;
  return <div className="grid gap-6 pt-8 sm:grid-cols-2 lg:grid-cols-3">{products.map((product) => <ProductCard key={product.slug} product={product} />)}</div>;
}
