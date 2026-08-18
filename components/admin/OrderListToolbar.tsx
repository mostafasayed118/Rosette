'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/features/i18n/I18nProvider';

const paymentOptions = ['pending', 'payment_started', 'paid', 'payment_failed', 'cancelled', 'refunded'];
const fulfillmentOptions = ['confirmed', 'preparing', 'ready_for_delivery', 'out_for_delivery', 'delivered', 'cancelled'];
const inputClass = 'h-10 w-full rounded-[10px] border border-border bg-background px-3.5 text-foreground';

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

  return <form className="my-4 grid grid-cols-[minmax(14rem,2fr)_repeat(2,1fr)_auto] items-end gap-3 max-md:grid-cols-1" onSubmit={submit}>
    <label className="grid gap-1.5"><span className="text-sm font-bold text-foreground">{t('adminSearch')}</span><input className={inputClass} name="q" defaultValue={searchParams.get('q') ?? ''} placeholder={t('adminSearchPlaceholder')} /></label>
    <label className="grid gap-1.5"><span className="text-sm font-bold text-foreground">{t('paymentFilter')}</span><select className={inputClass} name="payment" defaultValue={searchParams.get('payment') ?? ''}><option value="">{t('all')}</option>{paymentOptions.map((status) => <option key={status} value={status}>{status}</option>)}</select></label>
    <label className="grid gap-1.5"><span className="text-sm font-bold text-foreground">{t('fulfillmentFilter')}</span><select className={inputClass} name="fulfillment" defaultValue={searchParams.get('fulfillment') ?? ''}><option value="">{t('all')}</option>{fulfillmentOptions.map((status) => <option key={status} value={status}>{status}</option>)}</select></label>
    <Button type="submit">{t('filter')}</Button>
  </form>;
}