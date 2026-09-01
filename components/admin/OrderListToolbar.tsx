'use client';

import { useEffect, useState, useTransition } from 'react';
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
  const [isPending, startTransition] = useTransition();

  // keep local state synced when URL changes via back/forward
  useEffect(() => {
    setQ(searchParams.get('q') ?? '');
    setPayment(searchParams.get('payment') ?? '');
    setFulfillment(searchParams.get('fulfillment') ?? '');
  }, [searchParams]);

  function submit() {
    const params = new URLSearchParams();
    if (q.trim()) params.set('q', q.trim());
    if (payment) params.set('payment', payment);
    if (fulfillment) params.set('fulfillment', fulfillment);
    const url = `${pathname}${params.toString() ? `?${params}` : ''}`;
    startTransition(() => router.push(url));
  }

  function clearAll() {
    setQ('');
    setPayment('');
    setFulfillment('');
    startTransition(() => router.push(pathname));
  }

  return (
    <div className="grid grid-cols-1 items-end gap-3 lg:grid-cols-[1fr_1fr_1fr_auto] lg:gap-4">
      <div className="grid gap-1.5">
        <label htmlFor="admin-orders-q" className="text-sm font-medium text-foreground">
          {t('adminSearch')}
        </label>
        <Input
          id="admin-orders-q"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
          }}
          placeholder={t('adminSearchPlaceholder')}
          aria-label={t('adminSearch')}
        />
      </div>
      <div className="grid gap-1.5">
        <span className="text-sm font-medium text-foreground">{t('paymentFilter')}</span>
        <Select value={payment || 'all'} onValueChange={(v) => setPayment(v === 'all' ? '' : v)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('all')}</SelectItem>
            {paymentOptions.map((s) => (
              <SelectItem key={s} value={s}>
                {paymentLabel(s, t)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-1.5">
        <span className="text-sm font-medium text-foreground">{t('fulfillmentFilter')}</span>
        <Select value={fulfillment || 'all'} onValueChange={(v) => setFulfillment(v === 'all' ? '' : v)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('all')}</SelectItem>
            {fulfillmentOptions.map((s) => (
              <SelectItem key={s} value={s}>
                {fulfillmentLabel(s, t)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex gap-2 lg:pb-0">
        <Button type="button" onClick={submit} disabled={isPending} className="h-10 flex-1 lg:flex-none">
          {isPending ? t('loading') : t('filter')}
        </Button>
        <Button type="button" variant="outline" onClick={clearAll} disabled={isPending} className="h-10">
          {t('clear')}
        </Button>
      </div>
    </div>
  );
}
