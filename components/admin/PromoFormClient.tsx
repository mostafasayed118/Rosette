'use client';

import dynamic from 'next/dynamic';
import type { PromoInput } from '@/features/admin/promo-actions';

const PromoForm = dynamic(() => import('@/components/admin/PromoForm').then((m) => m.PromoForm), {
  ssr: false,
  loading: () => <div className="h-40 animate-pulse rounded bg-muted" />,
});

export default function PromoFormClient({ promo }: { promo: PromoInput }) {
  return <PromoForm promo={promo} />;
}
