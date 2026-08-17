import Link from 'next/link';
import { redirect } from 'next/navigation';
import { OrderActions } from '@/components/admin/OrderActions';
import { canTransitionFulfillment } from '@/features/commerce/order-state';
import type { FulfillmentStatus } from '@/features/commerce/order-state';
import { canUpdateOrderStatus } from '@/features/admin/authorization';
import { getCurrentAdmin } from '@/features/auth/server';
import { createAdminWhatsAppHref } from '@/features/support/whatsapp';
import { getAdminSupabase } from '@/lib/supabase/admin';

const allFulfillmentStatuses: FulfillmentStatus[] = ['confirmed', 'preparing', 'ready_for_delivery', 'out_for_delivery', 'delivered', 'cancelled'];

function money(minor: number) {
  return new Intl.NumberFormat('en-EG', { style: 'currency', currency: 'EGP', maximumFractionDigits: 0 }).format(minor / 100);
}

export default async function AdminOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentAdmin();
  if (!admin) redirect('/login');
  const { id } = await params;
  const supabase = getAdminSupabase();
  const { data: order } = await supabase.from('orders').select('*,order_items(*),payments(*),order_events(*)').eq('id', id).maybeSingle();
  if (!order) return <main className="content-frame"><h1>Order not found</h1><p><Link href="/admin/orders">Back to orders</Link></p></main>;

  const current = order.fulfillment_status as FulfillmentStatus;
  const transitions = allFulfillmentStatuses.filter((next) => canTransitionFulfillment(current, next) && canUpdateOrderStatus(admin.role, current, next));
  const whatsapp = createAdminWhatsAppHref({ number: order.recipient_phone, orderId: order.display_number });

  return <main className="content-frame">
    <p className="eyebrow"><Link href="/admin/orders">Orders</Link> · {order.display_number}</p>
    <h1>{order.display_number}</h1>
    <p>{money(order.total_minor)} · payment {order.payment_status} · fulfillment {order.fulfillment_status}</p>

    <section className="form-section"><p className="eyebrow">Recipient &amp; delivery</p>
      <p>{order.recipient_name} · {order.recipient_phone}</p>
      <p>{order.customer_email} · {order.delivery_city_code} · {order.delivery_date} · {order.delivery_window}</p>
      <p>{order.delivery_address}</p>
      {whatsapp ? <p><a className="button" href={whatsapp} target="_blank" rel="noopener noreferrer">Contact on WhatsApp</a></p> : null}
    </section>

    <section className="form-section"><p className="eyebrow">Items</p>
      {((order.order_items ?? []) as Array<{ id: string; product_name_en: string; unit_price_minor: number; quantity: number }>).map((item) => (
        <p key={item.id}>{item.product_name_en} × {item.quantity} · {money(item.unit_price_minor)}</p>
      ))}
    </section>

    <section className="form-section"><p className="eyebrow">Payment</p>
      {((order.payments ?? []) as Array<{ id: string; provider: string; provider_reference: string | null; amount_minor: number; status: string }>).map((payment) => (
        <p key={payment.id}>{payment.provider} · {payment.provider_reference ?? 'n/a'} · {money(payment.amount_minor)} · {payment.status}</p>
      ))}
    </section>

    <section className="form-section"><p className="eyebrow">Timeline</p>
      <ol className="order-timeline">
        {((order.order_events ?? []) as Array<{ id: string; event_type: string; from_status: string | null; to_status: string | null; created_at: string }>).map((event) => (
          <li key={event.id} className="timeline-step"><span className="timeline-dot" />{event.event_type}: {event.from_status ?? '—'} → {event.to_status ?? '—'} · {new Date(event.created_at).toLocaleString('en-GB')}</li>
        ))}
      </ol>
    </section>

    <section className="form-section"><p className="eyebrow">Update status</p>
      <OrderActions orderId={order.id} transitions={transitions} />
    </section>
  </main>;
}