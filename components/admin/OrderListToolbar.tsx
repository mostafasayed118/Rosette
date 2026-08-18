'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { FormEvent } from 'react';
import { useI18n } from '@/features/i18n/I18nProvider';

const paymentOptions = ['pending', 'payment_started', 'paid', 'payment_failed', 'cancelled', 'refunded'];
const fulfillmentOptions = ['confirmed', 'preparing', 'ready_for_delivery', 'out_for_delivery', 'delivered', 'cancelled'];

export function OrderListToolbar() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { t } = useI18n();

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
    <label className="field"><span>{t('adminSearch')}</span><input name="q" defaultValue={searchParams.get('q') ?? ''} placeholder={t('adminSearchPlaceholder')} /></label>
    <label className="field"><span>{t('paymentFilter')}</span><select name="payment" defaultValue={searchParams.get('payment') ?? ''}><option value="">{t('all')}</option>{paymentOptions.map((status) => <option key={status} value={status}>{status}</option>)}</select></label>
    <label className="field"><span>{t('fulfillmentFilter')}</span><select name="fulfillment" defaultValue={searchParams.get('fulfillment') ?? ''}><option value="">{t('all')}</option>{fulfillmentOptions.map((status) => <option key={status} value={status}>{status}</option>)}</select></label>
    <button className="button" type="submit">{t('filter')}</button>
  </form>;
}