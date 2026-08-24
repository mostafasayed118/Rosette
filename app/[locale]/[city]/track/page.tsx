import Link from 'next/link';
import { SiteFooter } from '@/components/layout/SiteFooter';
import { SiteHeader } from '@/components/layout/SiteHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { StatusMessage } from '@/components/ui/status-message';
import { getServerT } from '@/features/i18n/server';
import { pickLocalized } from '@/features/i18n/pick';
import { formatMoney } from '@/features/money';
import { lookupOrder } from '@/features/tracking/lookup-order';
import { FulfillmentProgress } from '@/components/tracking/FulfillmentProgress';
import { getAdminSupabase } from '@/lib/supabase/admin';

const FULFILLMENT_KEYS: Record<string, string> = {
  confirmed: 'orderConfirmed',
  preparing: 'preparing',
  ready_for_delivery: 'statusReadyForDelivery',
  out_for_delivery: 'outForDelivery',
  delivered: 'delivered',
  cancelled: 'statusCancelled',
};

const PAYMENT_KEYS: Record<string, string> = {
  pending: 'statusPending',
  payment_started: 'statusPaymentStarted',
  paid: 'statusPaid',
  payment_failed: 'statusPaymentFailed',
  cancelled: 'statusCancelled',
  refunded: 'statusRefunded',
};

const stitchCard = 'rounded border border-outline-variant/30 bg-surface-container-lowest p-4 md:p-6 shadow-[0_8px_32px_-4px_rgba(119,113,104,0.06)]';
const metaCard = 'rounded border border-outline-variant/30 bg-surface-container-lowest p-4 shadow-[0_8px_32px_-4px_rgba(119,113,104,0.06)]';

export default async function TrackPage({
  params: routeParams,
  searchParams,
}: {
  params: Promise<{ locale: string; city: string }>;
  searchParams: Promise<{ number?: string; email?: string }>;
}) {
  const { locale: localeSegment, city } = await routeParams;
  const { locale, t } = await getServerT(localeSegment);
  const trackHref = `/${localeSegment}/${city}/track`;
  const shopHref = `/${localeSegment}/${city}/shop`;
  const params = await searchParams;
  const number = params.number?.trim();
  const email = params.email?.trim();
  const searched = Boolean(number && email);
  const order = searched ? await lookupOrder(getAdminSupabase(), { number: number as string, email: email as string }) : null;

  const localeForDate = locale === 'ar' ? 'ar-EG' : locale === 'fr' ? 'fr-FR' : 'en-EG';

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-[1280px] flex-grow px-5 md:px-[64px] py-[64px]">
      {/* Header — Stitch: title + mono order number + sage delivery — max-w-[1280px] mx-auto px-5 md:px-[64px] */}
      <div className="mb-8 md:mb-[64px] md:w-2/3">
        <p className="font-meta-mono text-meta-mono uppercase tracking-[.16em] text-sage">{t('trackOrder')}</p>
        <h1 className="mt-2 font-headline-lg text-headline-lg md:text-display-xl text-on-surface">{t('trackTitle')}</h1>
        <p className="mt-3 max-w-[42rem] font-body-lg text-body-lg text-on-surface-variant">{t('trackLede')}</p>
        {searched && order ? (
          <div className="mt-4 flex flex-col gap-2 md:flex-row md:items-baseline">
            <span className="font-meta-mono text-meta-mono text-tertiary">#{order.number}</span>
            <span className="font-body-md text-body-md text-sage">
              {t('deliveryDetails')}: {order.deliveryCityCode} · {order.deliveryDate} · {order.deliveryWindow}
            </span>
          </div>
        ) : null}
      </div>

      {/* Lookup form — Stitch spacing & tokens */}
      <form
        className="grid max-w-[60rem] gap-6 border border-outline-variant/20 bg-surface-container-low/50 rounded p-4 md:p-6"
        action={trackHref}
        method="get"
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6">
          <label className="grid gap-2">
            <span className="font-meta-mono text-meta-mono text-on-surface-variant">{t('orderNumber')}</span>
            <Input
              type="text"
              name="number"
              defaultValue={number ?? ''}
              required
              className="h-12 rounded-full border-outline-variant bg-surface px-4 text-on-surface placeholder:text-on-surface-variant/60 focus-visible:border-primary focus-visible:ring-primary/20"
            />
          </label>
          <label className="grid gap-2">
            <span className="font-meta-mono text-meta-mono text-on-surface-variant">{t('email')}</span>
            <Input
              type="email"
              name="email"
              defaultValue={email ?? ''}
              required
              className="h-12 rounded-full border-outline-variant bg-surface px-4 text-on-surface placeholder:text-on-surface-variant/60 focus-visible:border-primary focus-visible:ring-primary/20"
            />
          </label>
        </div>
        <Button type="submit" className="w-fit rounded-full bg-primary px-8 py-6 text-sm font-medium text-on-primary hover:bg-on-primary-fixed-variant">
          {t('trackOrder')}
        </Button>
      </form>

      {searched && !order ? (
        <div className="mt-8 max-w-[60rem]">
          <StatusMessage title={t('trackLookupFailed')} tone="error">
            {t('checkConfirmationEmail')}
          </StatusMessage>
        </div>
      ) : null}

      {searched && order ? (
        <section className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-12 md:gap-[64px] border-t border-outline-variant/20 pt-8 md:pt-12">
          {/* Timeline column */}
          <div className="relative md:col-span-7 lg:col-span-6">
            {/* Meta row — payment / recipient / delivery */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 mb-8">
              <div className={metaCard}>
                <span className="font-meta-mono text-meta-mono text-tertiary block">{t('payment')}</span>
                <strong className="font-headline-sm text-headline-sm text-on-surface mt-1 block">{t(PAYMENT_KEYS[order.paymentStatus] ?? 'statusPending')}</strong>
              </div>
              <div className={metaCard}>
                <span className="font-meta-mono text-meta-mono text-tertiary block">{t('recipient')}</span>
                <strong className="font-headline-sm text-headline-sm text-on-surface mt-1 block truncate">{order.recipientName}</strong>
              </div>
              <div className={metaCard}>
                <span className="font-meta-mono text-meta-mono text-tertiary block">{t('deliveryDetails')}</span>
                <strong className="font-body-md text-body-md text-on-surface mt-1 block">
                  {order.deliveryCityCode} · {order.deliveryDate}
                  <span className="block font-meta-mono text-meta-mono text-on-surface-variant">{order.deliveryWindow}</span>
                </strong>
              </div>
            </div>

            <h2 className="font-headline-sm text-headline-sm text-on-surface mb-4">{t('fulfillment')}</h2>
            <FulfillmentProgress status={order.fulfillmentStatus} locale={locale} timeline={order.timeline} />

            <h2 className="font-headline-sm text-headline-sm text-on-surface mt-8 mb-4">{t('timeline')}</h2>
            <div className="grid gap-3">
              {order.timeline.map((entry, index) => (
                <div key={index} className={metaCard}>
                  <strong className="font-headline-sm text-headline-sm text-on-surface block">{t(FULFILLMENT_KEYS[entry.status] ?? entry.status)}</strong>
                  <span className="font-meta-mono text-meta-mono text-tertiary mt-1 block">
                    {new Date(entry.at).toLocaleString(localeForDate)}
                  </span>
                </div>
              ))}
              {order.timeline.length === 0 ? <p className="font-body-md text-body-md text-on-surface-variant">{t('statusPending')}</p> : null}
            </div>
          </div>

          {/* Order summary card — Stitch: bg-surface-container-lowest border-outline-variant/30 rounded sticky */}
          <div className="md:col-span-5 lg:col-span-4 lg:col-start-8 mt-8 md:mt-0">
            <div className={`${stitchCard} sticky top-8`}>
              <h3 className="font-headline-sm text-headline-sm text-on-surface mb-4 border-b border-outline-variant/30 pb-4">{t('items')}</h3>
              <div className="grid gap-4">
                {order.items.map((item, index) => (
                  <div key={index} className="flex gap-4 items-start border-b border-outline-variant/20 pb-4 last:border-0 last:pb-0">
                    <div className="h-20 w-20 shrink-0 overflow-hidden rounded border border-outline-variant/20 bg-surface-container flex items-center justify-center">
                      <span className="font-meta-mono text-meta-mono text-tertiary">✿</span>
                    </div>
                    <div className="grid gap-1">
                      <strong className="font-headline-sm text-headline-sm text-on-surface leading-tight">
                        {pickLocalized(locale, { en: item.nameEn, ar: item.nameAr })}
                      </strong>
                      <span className="font-meta-mono text-meta-mono text-tertiary">
                        {t('quantity')} {item.quantity} · <span className="font-meta-mono text-meta-mono">{formatMoney(item.unitPriceMinor, locale)}</span>
                      </span>
                      {item.addOns.map((addOn) => (
                        <span key={addOn.nameEn} className="font-body-md text-body-md text-on-surface-variant">
                          + {pickLocalized(locale, { en: addOn.nameEn, ar: addOn.nameAr })} ·{' '}
                          <span className="font-meta-mono text-meta-mono">{formatMoney(addOn.priceMinor, locale)}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <div className="pt-4 mt-4 border-t border-outline-variant/30 space-y-2">
                <div className="flex justify-between">
                  <span className="font-body-md text-body-md text-on-surface-variant">{t('subtotal')}</span>
                  <span className="font-meta-mono text-meta-mono text-on-surface">{formatMoney(order.subtotalMinor, locale)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-body-md text-body-md text-on-surface-variant">{t('delivery')}</span>
                  <span className="font-meta-mono text-meta-mono text-on-surface">{formatMoney(order.deliveryFeeMinor, locale)}</span>
                </div>
                <div className="flex justify-between gap-4 border-t border-outline-variant/30 pt-4 font-bold">
                  <span className="font-body-md text-body-md text-on-surface">{t('total')}</span>
                  <span className="font-meta-mono text-meta-mono text-on-surface">{formatMoney(order.totalMinor, locale)}</span>
                </div>
              </div>

              <div className="mt-8 text-center">
                <Link
                  href={shopHref}
                  className="inline-flex items-center gap-2 font-body-md text-body-md text-primary hover:text-on-primary-fixed-variant transition-colors"
                >
                  {t('keepBrowsing')} →
                </Link>
                <div className="mt-4">
                  <Link href={`/${locale}/${city}/shop`} className="inline-flex items-center gap-2 font-body-md text-body-md text-on-surface-variant hover:text-primary transition-colors">
                    <span className="text-[20px] leading-none">◌</span> {t('talkToTeam')}
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {!searched || !order ? (
        <p className="mt-10">
          <Link className="font-body-md text-body-md text-primary underline underline-offset-4 hover:text-on-primary-fixed-variant" href={shopHref}>
            {t('keepBrowsing')}
          </Link>
        </p>
      ) : null}
      </main>
      <SiteFooter locale={localeSegment} city={city} />
    </div>
  );
}
