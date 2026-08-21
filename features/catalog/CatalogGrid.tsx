'use client';

import { StatusMessage } from '@/components/ui/status-message';
import { useI18n } from '@/features/i18n/I18nProvider';
import { useStorePath } from '@/features/i18n/use-store-path';
import { ProductCard } from './ProductCard';
import type { Product } from './types';
import Link from 'next/link';

export function CatalogGrid({ products }: { products: Product[] }) {
  const { t } = useI18n();
  const { href } = useStorePath();
  if (products.length === 0) return <StatusMessage title={t('emptyTitle')}>{t('emptyHint')} <Link className="text-primary underline underline-offset-4" href={href('/shop')}>{t('resetCollection')}</Link>.</StatusMessage>;
  const col1 = products.filter((_, index) => index % 2 === 0);
  const col2 = products.filter((_, index) => index % 2 === 1);
  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2 md:gap-8 md:gap-y-8 items-start">
      <div className="masonry-col-1 flex flex-col gap-8">
        {col1.map((product) => <ProductCard key={product.slug} product={product} />)}
      </div>
      <div className="masonry-col-2 flex flex-col gap-8 md:pt-8">
        {col2.map((product) => <ProductCard key={product.slug} product={product} />)}
      </div>
    </div>
  );
}
