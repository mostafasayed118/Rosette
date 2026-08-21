import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getCustomerOrder, getCancelRequestForOrder, getChangeRequestForOrder } from '@/features/account/account-repository';
import { CancelRequestButton } from '@/components/account/CancelRequestButton';
import { ChangeRequestForm } from '@/components/account/ChangeRequestForm';
import { PayDifferenceButton } from '@/components/account/PayDifferenceButton';
import { canRequestCancellation } from '@/features/orders/cancel-request';
import { canRequestChange } from '@/features/orders/change-request';
import { getCurrentCustomer } from '@/features/auth/customer';
import { getServerSupabase } from '@/lib/supabase/server';
import { getServerT } from '@/features/i18n/server';
import { formatMoney } from '@/features/money';
import { fulfillmentLabel, paymentLabel, fulfillmentBadgeVariant, paymentBadgeVariant } from '@/features/admin/status-labels';

export default async function AccountOrderDetailPage({ params }: { params: Promise<{ locale: string; city: string; id: string }> }) {
  const { locale: routeLocale, city, id } = await params;
  const customer = await getCurrentCustomer();
  if (!customer) redirect(`/${routeLocale}/${city}/account/login`);
  const { t, locale } = await getServerT(routeLocale);
  const supabase = await getServerSupabase();
  const order = supabase ? await getCustomerOrder(supabase, customer.id, id) : null;
  if (!order) notFound();
  const cancelRequest = supabase ? await getCancelRequestForOrder(supabase, customer.id, order.id) : null;
  const changeRequest = supabase ? await getChangeRequestForOrder(supabase, customer.id, order.id) : null;
  const eligibility = canRequestCancellation({ fulfillmentStatus: order.fulfillmentStatus, paymentStatus: order.paymentStatus, hasPendingRequest: cancelRequest?.status === 'pending' });
  const changeEligibility = canRequestChange({ fulfillmentStatus: order.fulfillmentStatus, paymentStatus: order.paymentStatus, hasPendingRequest: changeRequest?.status === 'pending' || cancelRequest?.status === 'pending' });

  return (
    <div className="grid gap-6">
      <div>
        <p className="text-xs font-bold uppercase tracking-[.16em] text-sage"><Link className="underline underline-offset-4" href={`/${routeLocale}/${city}/account/orders`}>{t('myOrders')}</Link> · {order.displayNumber}</p>
        <div className="mt-2 flex items-center gap-3">
          <h1 className="font-display text-[clamp(2rem,4vw,3rem)] leading-tight tracking-[-.02em]">{order.displayNumber}</h1>
          <Badge variant={fulfillmentBadgeVariant(order.fulfillmentStatus)}>{fulfillmentLabel(order.fulfillmentStatus, t)}</Badge>
          <Badge variant={paymentBadgeVariant(order.paymentStatus)}>{paymentLabel(order.paymentStatus, t)}</Badge>
        </div>
        <p className="text-muted-foreground">{formatMoney(order.totalMinor, locale)} · {new Date(order.createdAt).toLocaleDateString(locale === 'ar' ? 'ar-EG' : locale === 'fr' ? 'fr-FR' : 'en-GB')}</p>
      </div>

      <Card><CardHeader><CardTitle>{t('deliveryDetails')}</CardTitle></CardHeader><CardContent>
        <p>{order.recipientName}</p>
        <p className="text-muted-foreground">{order.deliveryAddress}</p>
        <p className="text-muted-foreground">{order.deliveryDate} · {order.deliveryWindow}</p>
      </CardContent></Card>

      <Card><CardHeader><CardTitle>{t('items')}</CardTitle></CardHeader><CardContent className="grid gap-2">
        {order.items.map((item) => (
          <p key={item.id} className="flex justify-between gap-4 border-b py-2 text-sm">{item.nameEn} × {item.quantity}<strong>{formatMoney((item.unitPriceMinor + item.addOns.reduce((sum, addOn) => sum + addOn.price, 0)) * item.quantity, locale)}</strong></p>
        ))}
        <p className="flex justify-between gap-4 pt-2 text-sm">{t('subtotal')}<strong>{formatMoney(order.subtotalMinor, locale)}</strong></p>
        <p className="flex justify-between gap-4 text-sm">{t('delivery')}<strong>{formatMoney(order.deliveryFeeMinor, locale)}</strong></p>
        <p className="flex justify-between gap-4 font-bold">{t('total')}<strong>{formatMoney(order.totalMinor, locale)}</strong></p>
      </CardContent></Card>

      {cancelRequest?.status === 'pending' ? <Card><CardHeader><CardTitle>{t('cancelRequestPending')}</CardTitle></CardHeader><CardContent>{cancelRequest.reason ? <p className="text-sm text-muted-foreground">{t('cancellationReason')}: {cancelRequest.reason}</p> : null}</CardContent></Card>
        : cancelRequest?.status === 'approved' ? <Card><CardHeader><CardTitle>{t('cancelRequestApproved')}</CardTitle></CardHeader><CardContent>{cancelRequest.reason ? <p className="text-sm text-muted-foreground">{t('cancellationReason')}: {cancelRequest.reason}</p> : null}</CardContent></Card>
        : cancelRequest?.status === 'rejected' ? <Card><CardHeader><CardTitle>{t('cancelRequestRejected')}</CardTitle></CardHeader><CardContent>{cancelRequest.reason ? <p className="text-sm text-muted-foreground">{t('cancellationReason')}: {cancelRequest.reason}</p> : null}</CardContent></Card>
        : eligibility === 'ok' ? <Card><CardHeader><CardTitle>{t('requestCancellation')}</CardTitle></CardHeader><CardContent><CancelRequestButton orderId={order.id} /></CardContent></Card>
        : null}

      {changeRequest?.status === 'pending' ? <Card><CardHeader><CardTitle>{t('changePending')}</CardTitle></CardHeader><CardContent>{changeRequest.reason ? <p className="text-sm text-muted-foreground">{t('cancellationReason')}: {changeRequest.reason}</p> : null}</CardContent></Card>
        : changeRequest?.status === 'approved' ? <Card><CardHeader><CardTitle>{t('changeApproved')}</CardTitle></CardHeader><CardContent className="grid gap-2">{changeRequest.reason ? <p className="text-sm text-muted-foreground">{t('cancellationReason')}: {changeRequest.reason}</p> : null}<PayDifferenceButton requestId={changeRequest.id} /></CardContent></Card>
        : changeRequest?.status === 'applied' ? <Card><CardHeader><CardTitle>{t('changeApplied')}</CardTitle></CardHeader><CardContent>{changeRequest.reason ? <p className="text-sm text-muted-foreground">{t('cancellationReason')}: {changeRequest.reason}</p> : null}</CardContent></Card>
        : changeRequest?.status === 'rejected' ? <Card><CardHeader><CardTitle>{t('changeRejected')}</CardTitle></CardHeader><CardContent>{changeRequest.reason ? <p className="text-sm text-muted-foreground">{t('cancellationReason')}: {changeRequest.reason}</p> : null}</CardContent></Card>
        : changeEligibility === 'ok' ? <Card><CardHeader><CardTitle>{t('requestChange')}</CardTitle></CardHeader><CardContent><ChangeRequestForm orderId={order.id} items={order.items.map((item) => ({ id: item.id, name: item.nameEn, quantity: item.quantity, giftMessage: item.giftMessage }))} /></CardContent></Card>
        : null}

      {order.events.length ? (
        <Card><CardHeader><CardTitle>{t('timeline')}</CardTitle></CardHeader><CardContent>
          <ol className="grid list-none gap-0 p-0">
            {order.events.map((event) => (
              <li key={event.id} className="flex min-h-10 items-center gap-3 text-sm text-muted-foreground"><span className="h-2.5 w-2.5 shrink-0 rounded-full border-2 border-border bg-background" aria-hidden="true" />{event.eventType} · {new Date(event.createdAt).toLocaleString(locale === 'ar' ? 'ar-EG' : locale === 'fr' ? 'fr-FR' : 'en-GB')}</li>
            ))}
          </ol>
        </CardContent></Card>
      ) : null}

      <p className="text-xs text-muted-foreground"><Link className="text-primary underline underline-offset-4" href={`/${routeLocale}/${city}/account/orders`}>{t('backToAccount')}</Link></p>
    </div>
  );
}
