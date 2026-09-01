import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusMessage } from '@/components/ui/status-message';
import { PageHeader } from '@/components/admin/PageHeader';
import { KeyValueRow } from '@/components/admin/KeyValueRow';
import { OrderActions } from '@/components/admin/OrderActions';
import { CancelRequestReview } from '@/components/admin/CancelRequestReview';
import { NOTIFICATION_TYPE_LABEL_KEYS } from '@/features/admin/notification-type-labels';
import { canTransitionFulfillment } from '@/features/commerce/order-state';
import type { FulfillmentStatus } from '@/features/commerce/order-state';
import { canUpdateOrderStatus } from '@/features/admin/authorization';
import { getAdminOrderDetail } from '@/features/admin/repositories';
import { getCurrentAdmin } from '@/features/auth/server';
import { createAdminWhatsAppHref } from '@/features/support/whatsapp';
import { getAdminServerT } from '@/features/i18n/admin-server';
import { formatDateTime } from '@/lib/date';
import { formatMoney } from '@/features/money';
import { deliveryBadgeVariant, deliveryLabel, fulfillmentLabel, paymentLabel } from '@/features/admin/status-labels';

const allFulfillmentStatuses: FulfillmentStatus[] = ['confirmed', 'preparing', 'ready_for_delivery', 'out_for_delivery', 'delivered', 'cancelled'];

export default async function AdminOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const [admin, tData, { id }] = await Promise.all([getCurrentAdmin(), getAdminServerT(), params]);
  if (!admin) redirect('/login');
  const { t, locale } = tData;
  const order = await getAdminOrderDetail(id);
  if (!order) return <><h1 className="font-display text-[clamp(2rem,4vw,3rem)] leading-tight tracking-[-.02em]">{t('orderNotFound')}</h1><p className="mt-4"><Link className="text-sm text-primary underline underline-offset-4" href="/admin/orders">{t('backToOrders')}</Link></p></>;

  const current = order.fulfillmentStatus as FulfillmentStatus;
  const transitions = allFulfillmentStatuses.filter((next) => canTransitionFulfillment(current, next) && canUpdateOrderStatus(admin.role, current, next));
  const groups = order.groups;
  const whatsapp = createAdminWhatsAppHref({ number: order.recipientPhone, orderId: order.displayNumber });
  // Repo sorts: groups by position asc, deliveries newest-first, cancelRequests oldest-first.
  const deliveries = order.deliveries;
  const cancelRequests = order.cancelRequests;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs font-bold uppercase tracking-[.16em] text-sage">
        <Link className="underline underline-offset-4" href="/admin/orders" prefetch>
          {t('orders')}
        </Link>
      </p>
      <PageHeader title={order.displayNumber} description={`${formatMoney(order.totalMinor, locale)} · ${paymentLabel(order.paymentStatus, t)} · ${fulfillmentLabel(order.fulfillmentStatus, t)}`} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t('recipientAndDelivery')}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-1">
            <p className="font-medium break-words">
              {order.recipientName} · {order.recipientPhone}
            </p>
            <p className="text-sm text-muted-foreground break-all">{order.customerEmail} · {order.deliveryCityCode} · {order.deliveryDate} · {order.deliveryWindow}</p>
            <p className="text-sm text-muted-foreground whitespace-normal break-words">{order.deliveryAddress}</p>
            {whatsapp ? (
              <Button variant="outline" size="sm" asChild className="mt-3 w-fit">
                <a href={whatsapp} target="_blank" rel="noopener noreferrer">
                  {t('contactOnWhatsApp')}
                </a>
              </Button>
            ) : null}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t('items')}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2">
            {order.items.map((item) => (
              <KeyValueRow key={item.id} label={`${item.productName} × ${item.quantity}`} value={<strong className="tabular-nums">{formatMoney(item.unitPriceMinor, locale)}</strong>} />
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t('payment')}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2">
            {order.payments.map((payment) => (
              <KeyValueRow
                key={payment.id}
                label={`${payment.provider} · ${payment.providerReference ?? 'n/a'}`}
                value={<strong className="tabular-nums">{formatMoney(payment.amountMinor, locale)} · {payment.status}</strong>}
              />
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('updateStatus')}</CardTitle>
          </CardHeader>
          <CardContent>
            <OrderActions orderId={order.id} transitions={transitions} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('cancelRequests')}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          {cancelRequests.length === 0 ? (
            <StatusMessage title={t('noCancelRequests')} />
          ) : (
            cancelRequests.map((request) => (
              <KeyValueRow
                key={request.id}
                label={t('cancellationRequestedBy')}
                value={
                  <div className="grid gap-1">
                    <span className="break-all">{order.customerEmail}</span>
                    {request.reason ? <span className="text-sm text-muted-foreground whitespace-normal break-words">{t('cancellationReason')}: {request.reason}</span> : null}
                    <span className="text-xs text-muted-foreground tabular-nums">{formatDateTime(request.createdAt, locale)}</span>
                    {request.status === 'pending' ? (
                      <CancelRequestReview requestId={request.id} />
                    ) : (
                      <Badge variant={request.status === 'approved' ? 'success' : 'default'}>{request.status === 'approved' ? t('cancelRequestApproved') : t('cancelRequestRejected')}</Badge>
                    )}
                  </div>
                }
              />
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('emailLog')}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2">
          {deliveries.length === 0 ? (
            <StatusMessage title={t('noEmailsYet')} />
          ) : (
            deliveries.map((delivery) => (
              <div key={delivery.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b py-2 text-sm">
                <span className="font-medium">{t(NOTIFICATION_TYPE_LABEL_KEYS[delivery.type] ?? delivery.type)}</span>
                <span className="text-muted-foreground break-all">{delivery.recipient}</span>
                <Badge variant={deliveryBadgeVariant(delivery.status)}>{deliveryLabel(delivery.status, t)}</Badge>
                <span className="text-muted-foreground tabular-nums">
                  {t('attempts')}: {delivery.attempts}
                </span>
                <span className="text-muted-foreground tabular-nums">{formatDateTime(delivery.createdAt, locale)}</span>
                {delivery.sentAt ? <span className="text-muted-foreground tabular-nums">{t('sentAt')}: {formatDateTime(delivery.sentAt, locale)}</span> : null}
                {delivery.lastError ? <span className="font-mono text-xs text-muted-foreground break-all">{delivery.lastError}</span> : null}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('timeline')}</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="my-0 grid list-none gap-0 p-0">
            {order.events.map((event) => (
              <li key={event.id} className="flex min-h-10 items-center gap-3 text-sm text-muted-foreground">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full border-2 border-border bg-background" aria-hidden="true" />
                <span className="tabular-nums">
                  {event.eventType}: {event.fromStatus ?? '—'} → {event.toStatus ?? '—'} · {formatDateTime(event.createdAt, locale)}
                </span>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>

      {groups.length ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('recipientAndDelivery')}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            {groups.map((group) => {
              const groupCurrent = group.fulfillmentStatus as FulfillmentStatus;
              const groupTransitions = allFulfillmentStatuses.filter((next) => canTransitionFulfillment(groupCurrent, next) && canUpdateOrderStatus(admin.role, groupCurrent, next));
              return (
                <div key={group.id} className="rounded border border-outline-variant/30 p-4" data-testid={`admin-group-${group.position}`}>
                  <p className="font-medium break-words">
                    {group.recipientName} · {group.recipientPhone}
                  </p>
                  <p className="text-sm text-muted-foreground whitespace-normal break-words">
                    {group.deliveryAddress} · {group.deliveryDate} · {group.deliveryWindow} · {formatMoney(group.deliveryFeeMinor, locale)} · {fulfillmentLabel(group.fulfillmentStatus, t)}
                  </p>
                  <div className="mt-3">
                    <OrderActions orderId={order.id} groupId={group.id} transitions={groupTransitions} />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}