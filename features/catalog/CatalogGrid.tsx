'use client';

import Link from 'next/link';
import { StatusMessage } from '@/components/ui/status-message';
import { useI18n } from '@/features/i18n/I18nProvider';
import { useStorePath } from '@/features/i18n/use-store-path';
import { ProductCard } from './ProductCard';
import type { Product } from './types';

export function CatalogGrid({ products }: { products: Product[] }) {
  const { t } = useI18n();
  const { href } = useStorePath();
  if (products.length === 0) return <StatusMessage title={t('emptyTitle')}>{t('emptyHint')} <Link className="text-primary underline underline-offset-4" href={href('/shop')}>{t('resetCollection')}</Link>.</StatusMessage>;
  return <div className="grid grid-cols-4 gap-6 max-lg:grid-cols-2 max-sm:grid-cols-1">{products.map((product) => <ProductCard key={product.slug} product={product} />)}</div>;
}
