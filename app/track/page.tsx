import Link from 'next/link';
import { getServerT } from '@/features/i18n/server';
import { pickLocalized } from '@/features/i18n/pick';
import { formatMoney } from '@/features/money';
import { lookupOrder } from '@/features/tracking/lookup-order';
import { getAdminSupabase } from '@/lib/supabase/admin';

const FULFILLMENT_KEYS: Record<string, string> = {
  confirmed: 'orderConfirmed', preparing: 'preparing', ready_for_delivery: 'statusReadyForDelivery',
  out_for_delivery: 'outForDelivery', delivered: 'delivered', cancelled: 'statusCancelled',
};

const PAYMENT_KEYS: Record<string, string> = {
  pending: 'statusPending', payment_started: 'statusPaymentStarted', paid: 'statusPaid',
  payment_failed: 'statusPaymentFailed', cancelled: 'statusCancelled', refunded: 'statusRefunded',
};

export default async function TrackPage({ searchParams }: { searchParams: Promise<{ number?: string; email?: string }> }) {
  const { locale, t } = await getServerT();
  const params = await searchParams;
  const number = params.number?.trim();
  const email = params.email?.trim();
  const searched = Boolean(number && email);
  const order = searched ? await lookupOrder(getAdminSupabase(), { number: number as string, email: email as string }) : null;
  return <main className="content-frame">
    <p className="eyebrow">{t('trackOrder')}</p>
    <h1>{t('trackTitle')}</h1>
    <p>{t('trackLede')}</p>
    <form className="checkout-form" action="/track" method="get">
      <div className="form-grid">
        <label className="field"><span>{t('orderNumber')}</span><input type="text" name="number" defaultValue={number ?? ''} required /></label>
        <label className="field"><span>{t('email')}</span><input type="email" name="email" defaultValue={email ?? ''} required /></label>
      </div>
      <button className="button" type="submit">{t('trackOrder')}</button>
    </form>
    {searched && !order ? <div className="status-message" role="alert"><strong>{t('trackLookupFailed')}</strong><span>{t('checkConfirmationEmail')}</span></div> : null}
    {searched && order ? <section className="form-section">
      <p className="eyebrow">{t('orderEyebrow', { number: order.number })}</p>
      <div className="form-grid">
        <article className="status-message"><strong>{t('payment')}</strong><span>{t(PAYMENT_KEYS[order.paymentStatus] ?? 'statusPending')}</span></article>
        <article className="status-message"><strong>{t('fulfillment')}</strong><span>{t(FULFILLMENT_KEYS[order.fulfillmentStatus] ?? 'statusPending')}</span></article>
        <article className="status-message"><strong>{t('recipient')}</strong><span>{order.recipientName}</span></article>
        <article className="status-message"><strong>{t('deliveryDetails')}</strong><span>{order.deliveryCityCode} · {order.deliveryDate} · {order.deliveryWindow}</span></article>
      </div>
      <h2>{t('items')}</h2>
      <div className="admin-table">{order.items.map((item, index) => <article className="status-message" key={index}><strong>{pickLocalized(locale, { en: item.nameEn, ar: item.nameAr })}</strong><span>{t('quantity')} {item.quantity} · {formatMoney(item.unitPriceMinor, locale)}</span>{item.addOns.map((addOn) => <span key={addOn.nameEn}>+ {pickLocalized(locale, { en: addOn.nameEn, ar: addOn.nameAr })} · {formatMoney(addOn.priceMinor, locale)}</span>)}</article>)}</div>
      <div className="cart-summary"><div><span>{t('subtotal')}</span><span>{formatMoney(order.subtotalMinor, locale)}</span></div><div><span>{t('delivery')}</span><span>{formatMoney(order.deliveryFeeMinor, locale)}</span></div><div className="summary-total"><span>{t('total')}</span><span>{formatMoney(order.totalMinor, locale)}</span></div></div>
      <h2>{t('timeline')}</h2>
      <div className="admin-table">{order.timeline.map((entry, index) => <article className="status-message" key={index}><strong>{t(FULFILLMENT_KEYS[entry.status] ?? entry.status)}</strong><span>{new Date(entry.at).toLocaleString(locale === 'ar' ? 'ar-EG' : locale === 'fr' ? 'fr-FR' : 'en-EG')}</span></article>)}</div>
    </section> : null}
    <p><Link href="/shop">{t('keepBrowsing')}</Link></p>
  </main>;
}
