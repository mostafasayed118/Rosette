'use client';

import Link from 'next/link';
import { StatusMessage } from '@/components/ui/StatusMessage';
import { useI18n } from '@/features/i18n/I18nProvider';
import { ProductCard } from './ProductCard';
import type { Product } from './types';

export function CatalogGrid({ products }: { products: Product[] }) {
  const { t } = useI18n();
  if (products.length === 0) return <StatusMessage title={t('emptyTitle')}>{t('emptyHint')} <Link className="inline-link" href="/shop">{t('resetCollection')}</Link>.</StatusMessage>;
  return <div className="product-grid">{products.map((product) => <ProductCard key={product.slug} product={product} />)}</div>;
}
