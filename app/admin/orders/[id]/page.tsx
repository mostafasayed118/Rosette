import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AdminShell } from '@/components/admin/AdminShell';
import { OrderActions } from '@/components/admin/OrderActions';
import { canTransitionFulfillment } from '@/features/commerce/order-state';
import type { FulfillmentStatus } from '@/features/commerce/order-state';
import { canUpdateOrderStatus } from '@/features/admin/authorization';
import { getCurrentAdmin } from '@/features/auth/server';
import { createAdminWhatsAppHref } from '@/features/support/whatsapp';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { getServerT } from '@/features/i18n/server';
import { formatMoney } from '@/features/money';

const allFulfillmentStatuses: FulfillmentStatus[] = ['confirmed', 'preparing', 'ready_for_delivery', 'out_for_delivery', 'delivered', 'cancelled'];

export default async function AdminOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentAdmin();
  if (!admin) redirect('/login');
  const { t, locale } = await getServerT();
  const { id } = await params;
  const supabase = getAdminSupabase();
  const { data: order } = await supabase.from('orders').select('*,order_items(*),payments(*),order_events(*)').eq('id', id).maybeSingle();
  if (!order) return <AdminShell><h1 className="font-display text-[clamp(2rem,4vw,3rem)] leading-tight tracking-[-.02em]">{t('orderNotFound')}</h1><p className="mt-4"><Link className="text-sm text-primary underline underline-offset-4" href="/admin/orders">{t('backToOrders')}</Link></p></AdminShell>;

  const current = order.fulfillment_status as FulfillmentStatus;
  const transitions = allFulfillmentStatuses.filter((next) => canTransitionFulfillment(current, next) && canUpdateOrderStatus(admin.role, current, next));
  const whatsapp = createAdminWhatsAppHref({ number: order.recipient_phone, orderId: order.display_number });

  return <AdminShell>
    <p className="text-xs font-bold uppercase tracking-[.16em] text-sage"><Link className="underline underline-offset-4" href="/admin/orders">{t('orders')}</Link> · {order.display_number}</p>
    <h1 className="font-display text-[clamp(2rem,4vw,3rem)] leading-tight tracking-[-.02em]">{order.display_number}</h1>
    <p className="text-muted-foreground">{formatMoney(order.total_minor, locale)} · {t('payment')} {order.payment_status} · {t('fulfillmentFilter')} {order.fulfillment_status}</p>

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

    <Card className="mt-4"><CardHeader><CardTitle>{t('timeline')}</CardTitle></CardHeader><CardContent>
      <ol className="my-0 grid list-none gap-0 p-0">
        {((order.order_events ?? []) as Array<{ id: string; event_type: string; from_status: string | null; to_status: string | null; created_at: string }>).map((event) => (
          <li key={event.id} className="flex min-h-10 items-center gap-3 text-sm text-muted-foreground"><span className="h-2.5 w-2.5 shrink-0 rounded-full border-2 border-border bg-background" aria-hidden="true" />{event.event_type}: {event.from_status ?? '—'} → {event.to_status ?? '—'} · {new Date(event.created_at).toLocaleString('en-GB')}</li>
        ))}
      </ol>
    </CardContent></Card>

    <Card className="mt-4"><CardHeader><CardTitle>{t('updateStatus')}</CardTitle></CardHeader><CardContent>
      <OrderActions orderId={order.id} transitions={transitions} />
    </CardContent></Card>
  </AdminShell>;
}