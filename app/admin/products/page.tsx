import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentAdmin } from '@/features/auth/server';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { getServerT } from '@/features/i18n/server';
import { formatMoney } from '@/features/money';

export default async function AdminProductsPage() {
  const admin = await getCurrentAdmin();
  if (!admin) redirect('/login');
  const { t, locale } = await getServerT();
  const { data } = await getAdminSupabase().from('products').select('id,slug,name_en,name_ar,price_minor,active').order('created_at', { ascending: false });
  return <main className="content-frame"><p className="eyebrow">{t('catalogOperations')}</p><h1>{t('products')}</h1><p><Link className="button" href="/admin/products/new">{t('newProduct')}</Link></p><div className="admin-table">{(data ?? []).map((product) => <article className="status-message" key={product.id}><Link href={`/admin/products/${product.id}`}><strong>{product.name_en}</strong></Link><span>{product.name_ar} · {formatMoney(product.price_minor, locale)} · {product.active ? t('active') : t('inactive')}</span></article>)}</div></main>;
}
