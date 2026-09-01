'use client';

import dynamic from 'next/dynamic';
import type { ProductFormInitial } from '@/components/admin/ProductForm';

const ProductForm = dynamic(() => import('@/components/admin/ProductForm').then((m) => m.ProductForm), {
  ssr: false,
  loading: () => <div className="h-40 animate-pulse rounded bg-muted" />,
});

export default function ProductFormClient({ initial }: { initial?: ProductFormInitial }) {
  return <ProductForm initial={initial} />;
}
