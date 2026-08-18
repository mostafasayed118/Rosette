'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
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

export function OrderActions({ orderId, transitions }: { orderId: string; transitions: FulfillmentStatus[] }) {
  const router = useRouter();
  const { t } = useI18n();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState('');

  if (!transitions.length) return null;

  async function move(status: FulfillmentStatus) {
    setPending(status);
    setError('');
    const response = await fetch(`/api/admin/orders/${orderId}/status`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
    if (!response.ok) {
      setError(t('couldNotUpdateOrder'));
      setPending(null);
      return;
    }
    router.refresh();
  }

  return <div className="order-actions">{error ? <p className="status-message" role="alert"><strong>{error}</strong></p> : null}{transitions.map((status) => <button key={status} className="button" disabled={pending !== null} onClick={() => void move(status)}>{pending === status ? t('updating') : t(labelKeys[status])}</button>)}</div>;
}