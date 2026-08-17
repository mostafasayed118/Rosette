import { redirect } from 'next/navigation';
import { getCurrentAdmin } from '@/features/auth/server';
import { getAdminSupabase } from '@/lib/supabase/admin';

export default async function AdminInventoryPage() {
  const admin = await getCurrentAdmin();
  if (!admin) redirect('/login');
  const { data } = await getAdminSupabase().from('inventory').select('variant_id,quantity,reserved_quantity,updated_at').order('updated_at', { ascending: false });
  return <main className="content-frame"><p className="eyebrow">Stock operations</p><h1>Inventory</h1><div className="admin-table">{(data ?? []).map((row) => <article className="status-message" key={row.variant_id}><strong>{row.variant_id}</strong><span>{Math.max(0, row.quantity - row.reserved_quantity)} available · {row.reserved_quantity} reserved</span></article>)}</div></main>;
}
