import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { StatusMessage } from '@/components/ui/status-message';
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

const infoCardClass = 'rounded-2xl border bg-card p-5 shadow-sm';

export default async function TrackPage({ searchParams }: { searchParams: Promise<{ number?: string; email?: string }> }) {
  const { locale, t } = await getServerT();
  const params = await searchParams;
  const number = params.number?.trim();
  const email = params.email?.trim();
  const searched = Boolean(number && email);
  const order = searched ? await lookupOrder(getAdminSupabase(), { number: number as string, email: email as string }) : null;
  return <main className="mx-auto w-[min(calc(100%-3rem),80rem)] py-12 pb-24 max-md:w-[min(calc(100%-2rem),80rem)] max-md:pt-4">
    <p className="text-xs font-bold uppercase tracking-[.16em] text-sage">{t('trackOrder')}</p>
    <h1 className="mt-2 mb-4 max-w-[12ch] font-display text-[clamp(2.5rem,6vw,4.5rem)] leading-[.95] tracking-[-.02em]">{t('trackTitle')}</h1>
    <p className="max-w-[42rem] text-[1.1rem] text-muted-foreground">{t('trackLede')}</p>
    <form className="grid max-w-[60rem] gap-6 pt-8" action="/track" method="get">
      <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
        <label className="grid gap-1.5"><span className="text-sm font-bold text-foreground">{t('orderNumber')}</span><Input type="text" name="number" defaultValue={number ?? ''} required /></label>
        <label className="grid gap-1.5"><span className="text-sm font-bold text-foreground">{t('email')}</span><Input type="email" name="email" defaultValue={email ?? ''} required /></label>
      </div>
      <Button type="submit">{t('trackOrder')}</Button>
    </form>
    {searched && !order ? <StatusMessage title={t('trackLookupFailed')} tone="error">{t('checkConfirmationEmail')}</StatusMessage> : null}
    {searched && order ? <section className="grid gap-4 border-b py-6">
      <p className="text-xs font-bold uppercase tracking-[.16em] text-sage">{t('orderEyebrow', { number: order.number })}</p>
      <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
        <div className={infoCardClass}><strong className="block">{t('payment')}</strong><span className="text-sm text-muted-foreground">{t(PAYMENT_KEYS[order.paymentStatus] ?? 'statusPending')}</span></div>
        <div className={infoCardClass}><strong className="block">{t('fulfillment')}</strong><span className="text-sm text-muted-foreground">{t(FULFILLMENT_KEYS[order.fulfillmentStatus] ?? 'statusPending')}</span></div>
        <div className={infoCardClass}><strong className="block">{t('recipient')}</strong><span className="text-sm text-muted-foreground">{order.recipientName}</span></div>
        <div className={infoCardClass}><strong className="block">{t('deliveryDetails')}</strong><span className="text-sm text-muted-foreground">{order.deliveryCityCode} · {order.deliveryDate} · {order.deliveryWindow}</span></div>
      </div>
      <h2 className="font-display text-2xl">{t('items')}</h2>
      <div className="grid gap-3">{order.items.map((item, index) => <div className={infoCardClass} key={index}><strong className="block">{pickLocalized(locale, { en: item.nameEn, ar: item.nameAr })}</strong><span className="text-sm text-muted-foreground">{t('quantity')} {item.quantity} · {formatMoney(item.unitPriceMinor, locale)}</span>{item.addOns.map((addOn) => <span key={addOn.nameEn} className="block text-sm text-muted-foreground">+ {pickLocalized(locale, { en: addOn.nameEn, ar: addOn.nameAr })} · {formatMoney(addOn.priceMinor, locale)}</span>)}</div>)}</div>
      <div className="mb-6"><div className="flex justify-between gap-4 py-2"><span>{t('subtotal')}</span><span>{formatMoney(order.subtotalMinor, locale)}</span></div><div className="flex justify-between gap-4 py-2"><span>{t('delivery')}</span><span>{formatMoney(order.deliveryFeeMinor, locale)}</span></div><div className="mt-3 flex justify-between gap-4 border-t pt-4 font-bold text-primary"><span>{t('total')}</span><span>{formatMoney(order.totalMinor, locale)}</span></div></div>
      <h2 className="font-display text-2xl">{t('timeline')}</h2>
      <div className="grid gap-3">{order.timeline.map((entry, index) => <div className={infoCardClass} key={index}><strong className="block">{t(FULFILLMENT_KEYS[entry.status] ?? entry.status)}</strong><span className="text-sm text-muted-foreground">{new Date(entry.at).toLocaleString(locale === 'ar' ? 'ar-EG' : locale === 'fr' ? 'fr-FR' : 'en-EG')}</span></div>)}</div>
    </section> : null}
    <p className="mt-6"><Link className="text-primary underline underline-offset-4" href="/shop">{t('keepBrowsing')}</Link></p>
  </main>;
}
