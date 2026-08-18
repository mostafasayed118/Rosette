'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { StatusMessage } from '@/components/ui/status-message';
import { CartSummary, formatMoney } from '@/features/cart/CartSummary';
import { useI18n } from '@/features/i18n/I18nProvider';
import { pickLocalized } from '@/features/i18n/pick';
import { getLocalOrder } from './repository';
import { OrderTimeline } from './OrderTimeline';
import type { Order } from './types';

export function OrderPageContent({ id, token }: { id: string; token?: string }) {
  const { locale, t } = useI18n();
  const [order, setOrder] = useState<Order | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    async function load() {
      if (!token) {
        if (active) { setOrder(getLocalOrder(id)); setLoaded(true); }
        return;
      }
      try {
        const response = await fetch(`/api/orders/${encodeURIComponent(id)}?token=${encodeURIComponent(token)}`);
        const data = response.ok ? await response.json() as Order : null;
        if (active) setOrder(data);
      } catch {
        if (active) setOrder(null);
      } finally {
        if (active) setLoaded(true);
      }
    }
    void load();
    return () => { active = false; };
  }, [id, token]);

  if (!loaded) return <StatusMessage title={t('openingBag')} />;
  if (!order) return <StatusMessage title={t('orderMissing')}>{t('startAgain')} <Link className="text-primary underline underline-offset-4" href="/shop">{t('shop')}</Link>.</StatusMessage>;
  const paymentCopy = order.payment.method === 'demo-card' ? t('demoOrder') : order.payment.status === 'authorized' ? t('paymentConfirmed') : t('paymentPending');
  return <div className="grid grid-cols-[minmax(0,1fr)_minmax(260px,0.6fr)] gap-20 py-12 max-md:grid-cols-1"><section><p className="eyebrow">{t('orderEyebrow', { number: order.displayNumber })}</p><h1 className="mt-2 mb-6 max-w-[12ch] font-display text-[clamp(3rem,6vw,6rem)] leading-[.9] tracking-[-.06em] text-primary">{t('orderTitle')}</h1><p className="max-w-[42rem] text-[1.1rem] text-muted-foreground">{t('orderLede', { recipient: order.recipient.name, address: order.delivery.address })}</p><OrderTimeline status={order.status} /><Button asChild><Link href="/shop">{t('keepBrowsing')} ↗</Link></Button></section><aside className="self-start rounded-2xl border bg-card p-6 shadow-sm"><p className="eyebrow">{t('yourOrder')}</p>{order.items.map((item) => <div className="flex justify-between gap-4 border-b py-3 text-sm" key={item.id}><span>{pickLocalized(locale, { en: item.productName, ar: item.productNameAr, fr: item.productNameFr })} × {item.quantity}</span><strong>{formatMoney((item.unitPrice + item.addOns.reduce((sum, addOn) => sum + addOn.price, 0)) * item.quantity, locale)}</strong></div>)}<CartSummary totals={order.totals} /><p className="text-xs text-muted-foreground">{paymentCopy}</p></aside></div>;
}
