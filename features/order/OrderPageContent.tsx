'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { StatusMessage } from '@/components/ui/StatusMessage';
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

  if (!loaded) return <div className="status-message"><strong>{t('openingBag')}</strong></div>;
  if (!order) return <StatusMessage title={t('orderMissing')}>{t('startAgain')} <Link className="inline-link" href="/shop">{t('shop')}</Link>.</StatusMessage>;
  const paymentCopy = order.payment.method === 'demo-card' ? t('demoOrder') : order.payment.status === 'authorized' ? t('paymentConfirmed') : t('paymentPending');
  return <div className="order-layout"><section><p className="eyebrow">{t('orderEyebrow', { number: order.displayNumber })}</p><h1>{t('orderTitle')}</h1><p className="lede">{t('orderLede', { recipient: order.recipient.name, address: order.delivery.address })}</p><OrderTimeline status={order.status} /><Link className="button" href="/shop">{t('keepBrowsing')} ↗</Link></section><aside className="order-card"><p className="eyebrow">{t('yourOrder')}</p>{order.items.map((item) => <div className="order-item" key={item.id}><span>{pickLocalized(locale, { en: item.productName, ar: item.productNameAr, fr: item.productNameFr })} × {item.quantity}</span><strong>{formatMoney((item.unitPrice + item.addOns.reduce((sum, addOn) => sum + addOn.price, 0)) * item.quantity, locale)}</strong></div>)}<CartSummary totals={order.totals} /><p className="demo-disclosure">{paymentCopy}</p></aside></div>;
}
