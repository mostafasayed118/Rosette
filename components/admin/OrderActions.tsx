'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { FulfillmentStatus } from '@/features/commerce/order-state';

const labels: Record<FulfillmentStatus, string> = {
  confirmed: 'Confirmed',
  preparing: 'Preparing',
  ready_for_delivery: 'Ready for delivery',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

export function OrderActions({ orderId, transitions }: { orderId: string; transitions: FulfillmentStatus[] }) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState('');

  if (!transitions.length) return null;

  async function move(status: FulfillmentStatus) {
    setPending(status);
    setError('');
    const response = await fetch(`/api/admin/orders/${orderId}/status`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
    if (!response.ok) {
      setError('Could not update the order. Refresh and try again.');
      setPending(null);
      return;
    }
    router.refresh();
  }

  return <div className="order-actions">{error ? <p className="status-message" role="alert"><strong>{error}</strong></p> : null}{transitions.map((status) => <button key={status} className="button" disabled={pending !== null} onClick={() => void move(status)}>{pending === status ? 'Updating…' : labels[status]}</button>)}</div>;
}