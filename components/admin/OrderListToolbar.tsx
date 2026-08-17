'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { FormEvent } from 'react';

const paymentOptions = ['pending', 'payment_started', 'paid', 'payment_failed', 'cancelled', 'refunded'];
const fulfillmentOptions = ['confirmed', 'preparing', 'ready_for_delivery', 'out_for_delivery', 'delivered', 'cancelled'];

export function OrderListToolbar() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const params = new URLSearchParams();
    const q = String(form.get('q') ?? '').trim();
    const payment = String(form.get('payment') ?? '');
    const fulfillment = String(form.get('fulfillment') ?? '');
    if (q) params.set('q', q);
    if (payment) params.set('payment', payment);
    if (fulfillment) params.set('fulfillment', fulfillment);
    router.push(`${pathname}${params.toString() ? `?${params}` : ''}`);
  }

  return <form className="admin-toolbar" onSubmit={submit}>
    <label className="field"><span>Search</span><input name="q" defaultValue={searchParams.get('q') ?? ''} placeholder="Order number, email, or phone" /></label>
    <label className="field"><span>Payment</span><select name="payment" defaultValue={searchParams.get('payment') ?? ''}><option value="">All</option>{paymentOptions.map((status) => <option key={status} value={status}>{status}</option>)}</select></label>
    <label className="field"><span>Fulfillment</span><select name="fulfillment" defaultValue={searchParams.get('fulfillment') ?? ''}><option value="">All</option>{fulfillmentOptions.map((status) => <option key={status} value={status}>{status}</option>)}</select></label>
    <button className="button" type="submit">Filter</button>
  </form>;
}