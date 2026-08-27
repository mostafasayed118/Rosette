'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import type { FulfillmentStatus } from '@/features/commerce/order-state';
import { useI18n } from '@/features/i18n/I18nProvider';

const labelKeys: Record<FulfillmentStatus, string> = {
  confirmed: 'statusConfirmed',
  preparing: 'statusPreparing',
  ready_for_delivery: 'statusReadyForDelivery',
  out_for_delivery: 'statusOutForDelivery',
  delivered: 'statusDelivered',
  cancelled: 'statusCancelled',
};

export function OrderActions({ orderId, groupId, transitions }: { orderId: string; groupId?: string; transitions: FulfillmentStatus[] }) {
  const router = useRouter();
  const { t } = useI18n();
  const [pending, setPending] = useState<string | null>(null);

  if (!transitions.length) return null;

  async function move(status: FulfillmentStatus) {
    setPending(status);
    const response = await fetch(`/api/admin/orders/${orderId}/status`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(groupId ? { status, groupId } : { status }) });
    if (!response.ok) {
      toast.error(t('couldNotUpdateOrder'));
      setPending(null);
      return;
    }
    toast.success(t('statusUpdated'));
    router.refresh();
  }

  return <div className="grid gap-3"><div className="flex flex-wrap gap-2.5">{transitions.map((status) => <Button key={status} size="sm" variant="outline" disabled={pending !== null} onClick={() => void move(status)}>{pending === status ? t('updating') : t(labelKeys[status])}</Button>)}</div></div>;
}