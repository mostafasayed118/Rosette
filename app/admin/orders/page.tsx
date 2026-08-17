import { redirect } from 'next/navigation';
import { getCurrentAdmin } from '@/features/auth/server';
import { getAdminSupabase } from '@/lib/supabase/admin';

export default async function AdminOrdersPage() {
  const admin = await getCurrentAdmin();
  if (!admin) redirect('/login');
  const { data } = await getAdminSupabase().from('orders').select('id,display_number,customer_email,total_minor,payment_status,fulfillment_status,created_at').order('created_at', { ascending: false });
  return <main className="content-frame"><p className="eyebrow">Customer orders</p><h1>Orders</h1><div className="admin-table">{(data ?? []).map((order) => <article className="status-message" key={order.id}><strong>{order.display_number}</strong><span>{order.customer_email} · {order.total_minor / 100} EGP · {order.payment_status} · {order.fulfillment_status}</span></article>)}</div></main>;
}
