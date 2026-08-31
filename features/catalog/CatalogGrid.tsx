'use client';

import Link from 'next/link';
import { StatusMessage } from '@/components/ui/status-message';
import { useI18n } from '@/features/i18n/I18nProvider';
import { useStorePath } from '@/features/i18n/use-store-path';
import { ProductCard } from './ProductCard';
import type { Product } from './types';

const ASPECTS = ['aspect-[4/5]', 'aspect-square', 'aspect-[4/5]'] as const;

export function CatalogGrid({ products }: { products: Product[] }) {
  const { t } = useI18n();
  const { href } = useStorePath();
  if (products.length === 0) return <StatusMessage title={t('emptyTitle')}>{t('emptyHint')} <Link className="text-primary underline underline-offset-4" href={href('/shop')}>{t('resetCollection')}</Link>.</StatusMessage>;
  return (
    <div className="grid grid-cols-1 items-start gap-10 md:grid-cols-2 md:gap-12 lg:grid-cols-3">
      {products.map((product, index) => (
        <ProductCard
          key={product.slug}
          product={product}
          aspectClass={ASPECTS[index % 3]}
          // Short result sets should optimize for comparison; reserve the
          // editorial stagger for collections with enough cards to sustain it.
          className={products.length >= 5 && index % 3 === 1 ? 'lg:mt-16' : ''}
        />
      ))}
    </div>
  );
}
