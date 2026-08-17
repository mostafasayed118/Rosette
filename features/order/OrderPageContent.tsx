'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { StatusMessage } from '@/components/ui/StatusMessage';
import { CartSummary, formatMoney } from '@/features/cart/CartSummary';
import { useI18n } from '@/features/i18n/I18nProvider';
import { getLocalOrder } from './repository';
import { OrderTimeline } from './OrderTimeline';
import type { Order } from './types';

export function OrderPageContent({ id }: { id: string }) { const { locale, t } = useI18n(); const [order, setOrder] = useState<Order | null>(null); useEffect(() => setOrder(getLocalOrder(id)), [id]); if (!order) return <StatusMessage title={t('orderMissing')}>{t('startAgain')} <Link className="inline-link" href="/shop">{t('shop')}</Link>.</StatusMessage>; return <div className="order-layout"><section><p className="eyebrow">{t('orderEyebrow', { number: order.displayNumber })}</p><h1>{t('orderTitle')}</h1><p className="lede">{t('orderLede', { recipient: order.recipient.name, address: order.delivery.address })}</p><OrderTimeline status={order.status} /><Link className="button" href="/shop">{t('keepBrowsing')} ↗</Link></section><aside className="order-card"><p className="eyebrow">{t('yourOrder')}</p>{order.items.map((item) => <div className="order-item" key={item.id}><span>{locale === 'ar' ? item.productNameAr ?? item.productName : item.productName} × {item.quantity}</span><strong>{formatMoney((item.unitPrice + item.addOns.reduce((sum, addOn) => sum + addOn.price, 0)) * item.quantity, locale)}</strong></div>)}<CartSummary totals={order.totals} /><p className="demo-disclosure">{t('demoOrder')}</p></aside></div>; }
