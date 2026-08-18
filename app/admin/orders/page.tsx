import Link from 'next/link';
import { redirect } from 'next/navigation';
import { OrderListToolbar } from '@/components/admin/OrderListToolbar';
import { buildOrderListQuery } from '@/features/admin/order-list-query';
import { getCurrentAdmin } from '@/features/auth/server';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { getServerT } from '@/features/i18n/server';
import { formatMoney } from '@/features/money';

function first(value: string | string[] | undefined) {
  return typeof value === 'string' ? value : undefined;
}

export default async function AdminOrdersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const admin = await getCurrentAdmin();
  if (!admin) redirect('/login');
  const { t, locale } = await getServerT();
  const params = await searchParams;
  const constraints = buildOrderListQuery({ q: first(params.q), payment: first(params.payment), fulfillment: first(params.fulfillment) });

  let query = getAdminSupabase().from('orders').select('id,display_number,customer_email,recipient_name,total_minor,payment_status,fulfillment_status,created_at').order('created_at', { ascending: false }).limit(100);
  if (constraints.search) query = query.or(`display_number.ilike.%${constraints.search}%,customer_email.ilike.%${constraints.search}%,customer_phone.ilike.%${constraints.search}%`);
  if (constraints.paymentStatus) query = query.eq('payment_status', constraints.paymentStatus);
  if (constraints.fulfillmentStatus) query = query.eq('fulfillment_status', constraints.fulfillmentStatus);
  const { data } = await query;

  const rows = (data ?? []) as Array<{ id: string; display_number: string; customer_email: string; recipient_name: string; total_minor: number; payment_status: string; fulfillment_status: string }>;

  return <main className="content-frame">
    <p className="eyebrow">{t('customerOrders')}</p>
    <h1>{t('orders')}</h1>
    <OrderListToolbar />
    <div className="admin-table">
      {rows.length === 0 ? <p className="status-message">{t('noOrdersMatch')}</p> : rows.map((order) => (
        <article className="status-message" key={order.id}>
          <Link href={`/admin/orders/${order.id}`}><strong>{order.display_number}</strong></Link>
          <span>{order.recipient_name} · {order.customer_email} · {formatMoney(order.total_minor, locale)} · {order.payment_status} · {order.fulfillment_status}</span>
        </article>
      ))}
    </div>
  </main>;
}