import { redirect } from 'next/navigation';
import { getCurrentAdmin } from '@/features/auth/server';
import { getAdminSupabase } from '@/lib/supabase/admin';

export default async function AdminProductsPage() {
  const admin = await getCurrentAdmin();
  if (!admin) redirect('/login');
  const { data } = await getAdminSupabase().from('products').select('id,slug,name_en,name_ar,price_minor,active').order('created_at', { ascending: false });
  return <main className="content-frame"><p className="eyebrow">Catalog operations</p><h1>Products</h1><div className="admin-table">{(data ?? []).map((product) => <article className="status-message" key={product.id}><strong>{product.name_en}</strong><span>{product.name_ar} · {product.price_minor / 100} EGP · {product.active ? 'Active' : 'Inactive'}</span></article>)}</div></main>;
}
