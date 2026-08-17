import { redirect } from 'next/navigation';
import { getCurrentAdmin } from '@/features/auth/server';
import { getAdminSupabase } from '@/lib/supabase/admin';

export default async function AdminDeliveryPage() {
  const admin = await getCurrentAdmin();
  if (!admin) redirect('/');
  const { data } = await getAdminSupabase().from('delivery_rules').select('id,city_code,fee_minor,minimum_order_minor,cutoff_hour,active').order('city_code');
  return <main className="content-frame"><p className="eyebrow">Delivery operations</p><h1>Delivery rules</h1><div className="admin-table">{(data ?? []).map((rule) => <article className="status-message" key={rule.id}><strong>{rule.city_code}</strong><span>{rule.fee_minor / 100} EGP · cutoff {rule.cutoff_hour}:00 · {rule.active ? 'Active' : 'Inactive'}</span></article>)}</div></main>;
}
