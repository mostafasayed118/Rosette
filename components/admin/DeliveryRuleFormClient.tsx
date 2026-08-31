'use client';

import dynamic from 'next/dynamic';
import type { DeliveryRuleInitial } from '@/components/admin/DeliveryRuleForm';

const DeliveryRuleForm = dynamic(() => import('@/components/admin/DeliveryRuleForm').then((m) => m.DeliveryRuleForm), {
  ssr: false,
  loading: () => <div className="h-40 animate-pulse rounded bg-muted" />,
});

export default function DeliveryRuleFormClient({ cityCode, initial }: { cityCode: string; initial: DeliveryRuleInitial }) {
  return <DeliveryRuleForm cityCode={cityCode} initial={initial} />;
}
