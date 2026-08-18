'use client';

import { useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useI18n } from '@/features/i18n/I18nProvider';
import { fulfillmentLabel, paymentLabel } from '@/features/admin/status-labels';

const paymentOptions = ['pending', 'payment_started', 'paid', 'payment_failed', 'cancelled', 'refunded'];
const fulfillmentOptions = ['confirmed', 'preparing', 'ready_for_delivery', 'out_for_delivery', 'delivered', 'cancelled'];

export function OrderListToolbar() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { t } = useI18n();
  const [q, setQ] = useState(searchParams.get('q') ?? '');
  const [payment, setPayment] = useState(searchParams.get('payment') ?? '');
  const [fulfillment, setFulfillment] = useState(searchParams.get('fulfillment') ?? '');

  function submit() {
    const params = new URLSearchParams();
    if (q.trim()) params.set('q', q.trim());
    if (payment) params.set('payment', payment);
    if (fulfillment) params.set('fulfillment', fulfillment);
    router.push(`${pathname}${params.toString() ? `?${params}` : ''}`);
  }

  return <div className="my-4 grid grid-cols-[minmax(14rem,2fr)_repeat(2,1fr)_auto] items-end gap-3 max-md:grid-cols-1">
    <div className="grid gap-1.5"><span className="text-sm font-bold text-foreground">{t('adminSearch')}</span><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('adminSearchPlaceholder')} /></div>
    <div className="grid gap-1.5"><span className="text-sm font-bold text-foreground">{t('paymentFilter')}</span><Select value={payment || 'all'} onValueChange={(v) => setPayment(v === 'all' ? '' : v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">{t('all')}</SelectItem>{paymentOptions.map((s) => <SelectItem key={s} value={s}>{paymentLabel(s, t)}</SelectItem>)}</SelectContent></Select></div>
    <div className="grid gap-1.5"><span className="text-sm font-bold text-foreground">{t('fulfillmentFilter')}</span><Select value={fulfillment || 'all'} onValueChange={(v) => setFulfillment(v === 'all' ? '' : v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">{t('all')}</SelectItem>{fulfillmentOptions.map((s) => <SelectItem key={s} value={s}>{fulfillmentLabel(s, t)}</SelectItem>)}</SelectContent></Select></div>
    <Button type="button" onClick={submit}>{t('filter')}</Button>
  </div>;
}
