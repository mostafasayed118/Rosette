import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusMessage } from '@/components/ui/status-message';
import { PageHeader } from '@/components/admin/PageHeader';
import { OrderActions } from '@/components/admin/OrderActions';
import { CancelRequestReview } from '@/components/admin/CancelRequestReview';
import { NOTIFICATION_TYPE_LABEL_KEYS } from '@/features/admin/notification-type-labels';
import { canTransitionFulfillment } from '@/features/commerce/order-state';
import type { FulfillmentStatus } from '@/features/commerce/order-state';
import { canUpdateOrderStatus } from '@/features/admin/authorization';
import { getCurrentAdmin } from '@/features/auth/server';
import { createAdminWhatsAppHref } from '@/features/support/whatsapp';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { getServerT } from '@/features/i18n/server';
import { formatMoney } from '@/features/money';
import { deliveryBadgeVariant, deliveryLabel, fulfillmentLabel, paymentLabel } from '@/features/admin/status-labels';

const allFulfillmentStatuses: FulfillmentStatus[] = ['confirmed', 'preparing', 'ready_for_delivery', 'out_for_delivery', 'delivered', 'cancelled'];

export default async function AdminOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentAdmin();
  if (!admin) redirect('/login');
  const { t, locale } = await getServerT();
  const { id } = await params;
  const supabase = getAdminSupabase();
  const { data: order } = await supabase.from('orders').select('*,order_items(*),payments(*),order_events(*),notification_deliveries(*),order_cancel_requests(*)').eq('id', id).maybeSingle();
  if (!order) return <><h1 className="font-display text-[clamp(2rem,4vw,3rem)] leading-tight tracking-[-.02em]">{t('orderNotFound')}</h1><p className="mt-4"><Link className="text-sm text-primary underline underline-offset-4" href="/admin/orders">{t('backToOrders')}</Link></p></>;

  const current = order.fulfillment_status as FulfillmentStatus;
  const transitions = allFulfillmentStatuses.filter((next) => canTransitionFulfillment(current, next) && canUpdateOrderStatus(admin.role, current, next));
  const whatsapp = createAdminWhatsAppHref({ number: order.recipient_phone, orderId: order.display_number });
  const deliveries = ((order.notification_deliveries ?? []) as Array<{ id: string; type: string; recipient: string; status: string; attempts: number; last_error: string | null; created_at: string; sent_at: string | null }>).sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0));
  const cancelRequests = ((order.order_cancel_requests ?? []) as Array<{ id: string; status: string; reason: string | null; created_at: string }>).sort((a, b) => (a.created_at < b.created_at ? 1 : -1));

  return <>
    <p className="text-xs font-bold uppercase tracking-[.16em] text-sage"><Link className="underline underline-offset-4" href="/admin/orders">{t('orders')}</Link></p>
    <PageHeader eyebrow="" title={order.display_number} description={`${formatMoney(order.total_minor, locale)} · ${paymentLabel(order.payment_status, t)} · ${fulfillmentLabel(order.fulfillment_status, t)}`} />

    <Card className="mt-6"><CardHeader><CardTitle>{t('recipientAndDelivery')}</CardTitle></CardHeader><CardContent>
      <p>{order.recipient_name} · {order.recipient_phone}</p>
      <p className="text-muted-foreground">{order.customer_email} · {order.delivery_city_code} · {order.delivery_date} · {order.delivery_window}</p>
      <p className="text-muted-foreground">{order.delivery_address}</p>
      {whatsapp ? <Button variant="outline" size="sm" asChild className="mt-4"><a href={whatsapp} target="_blank" rel="noopener noreferrer">{t('contactOnWhatsApp')}</a></Button> : null}
    </CardContent></Card>

    <Card className="mt-4"><CardHeader><CardTitle>{t('items')}</CardTitle></CardHeader><CardContent className="grid gap-2">
      {((order.order_items ?? []) as Array<{ id: string; product_name_en: string; unit_price_minor: number; quantity: number }>).map((item) => (
        <p key={item.id} className="flex justify-between gap-4 border-b py-2 text-sm">{item.product_name_en} × {item.quantity}<strong>{formatMoney(item.unit_price_minor, locale)}</strong></p>
      ))}
    </CardContent></Card>

    <Card className="mt-4"><CardHeader><CardTitle>{t('payment')}</CardTitle></CardHeader><CardContent className="grid gap-2">
      {((order.payments ?? []) as Array<{ id: string; provider: string; provider_reference: string | null; amount_minor: number; status: string }>).map((payment) => (
        <p key={payment.id} className="flex justify-between gap-4 border-b py-2 text-sm">{payment.provider} · {payment.provider_reference ?? 'n/a'}<strong>{formatMoney(payment.amount_minor, locale)} · {payment.status}</strong></p>
      ))}
    </CardContent></Card>

    <Card className="mt-4"><CardHeader><CardTitle>{t('cancelRequests')}</CardTitle></CardHeader><CardContent className="grid gap-3">
      {cancelRequests.length === 0 ? <p className="text-sm text-muted-foreground">{t('noCancelRequests')}</p> : cancelRequests.map((request) => (
        <div key={request.id} className="flex flex-wrap items-center justify-between gap-3 border-b py-2">
          <div className="min-w-0"><p className="text-sm">{t('cancellationRequestedBy')} {order.customer_email}</p>{request.reason ? <p className="text-sm text-muted-foreground">{t('cancellationReason')}: {request.reason}</p> : null}<p className="text-xs text-muted-foreground">{new Date(request.created_at).toLocaleString(locale === 'ar' ? 'ar-EG' : locale === 'fr' ? 'fr-FR' : 'en-GB')}</p></div>
          {request.status === 'pending' ? <CancelRequestReview requestId={request.id} /> : <Badge variant={request.status === 'approved' ? 'success' : 'default'}>{request.status === 'approved' ? t('cancelRequestApproved') : t('cancelRequestRejected')}</Badge>}
        </div>
      ))}
    </CardContent></Card>

    <Card className="mt-4"><CardHeader><CardTitle>{t('emailLog')}</CardTitle></CardHeader><CardContent className="grid gap-2">
      {deliveries.length === 0 ? <StatusMessage title={t('noEmailsYet')} /> : deliveries.map((delivery) => (
        <div key={delivery.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b py-2 text-sm">
          <span>{t(NOTIFICATION_TYPE_LABEL_KEYS[delivery.type] ?? delivery.type)}</span>
          <span className="text-muted-foreground">{delivery.recipient}</span>
          <Badge variant={deliveryBadgeVariant(delivery.status)}>{deliveryLabel(delivery.status, t)}</Badge>
          <span className="text-muted-foreground">{t('attempts')}: {delivery.attempts}</span>
          <span className="text-muted-foreground">{new Date(delivery.created_at).toLocaleString(locale === 'ar' ? 'ar-EG' : locale === 'fr' ? 'fr-FR' : 'en-GB')}</span>
          {delivery.sent_at ? <span className="text-muted-foreground">{t('sentAt')}: {new Date(delivery.sent_at).toLocaleString(locale === 'ar' ? 'ar-EG' : locale === 'fr' ? 'fr-FR' : 'en-GB')}</span> : null}
          {delivery.last_error ? <span className="font-mono text-xs text-muted-foreground">{delivery.last_error}</span> : null}
        </div>
      ))}
    </CardContent></Card>

    <Card className="mt-4"><CardHeader><CardTitle>{t('timeline')}</CardTitle></CardHeader><CardContent>
      <ol className="my-0 grid list-none gap-0 p-0">
        {((order.order_events ?? []) as Array<{ id: string; event_type: string; from_status: string | null; to_status: string | null; created_at: string }>).map((event) => (
          <li key={event.id} className="flex min-h-10 items-center gap-3 text-sm text-muted-foreground"><span className="h-2.5 w-2.5 shrink-0 rounded-full border-2 border-border bg-background" aria-hidden="true" />{event.event_type}: {event.from_status ?? '—'} → {event.to_status ?? '—'} · {new Date(event.created_at).toLocaleString(locale === 'ar' ? 'ar-EG' : locale === 'fr' ? 'fr-FR' : 'en-GB')}</li>
        ))}
      </ol>
    </CardContent></Card>

    <Card className="mt-4"><CardHeader><CardTitle>{t('updateStatus')}</CardTitle></CardHeader><CardContent>
      <OrderActions orderId={order.id} transitions={transitions} />
    </CardContent></Card>
  </>;
}