import { redirect } from 'next/navigation';
import { SetQuantityForm } from '@/components/admin/SetQuantityForm';
import { getCurrentAdmin } from '@/features/auth/server';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { getServerT } from '@/features/i18n/server';

export default async function AdminInventoryPage() {
  const admin = await getCurrentAdmin();
  if (!admin) redirect('/login');
  const { t } = await getServerT();
  const { data } = await getAdminSupabase().from('inventory').select('variant_id,quantity,reserved_quantity,updated_at').order('updated_at', { ascending: false });
  return <main className="content-frame"><p className="eyebrow">{t('stockOperations')}</p><h1>{t('inventory')}</h1><div className="admin-table">{(data ?? []).map((row) => <article className="status-message" key={row.variant_id}><strong>{row.variant_id}</strong><span>{Math.max(0, row.quantity - row.reserved_quantity)} {t('available')} · {row.reserved_quantity} {t('reserved')}</span><SetQuantityForm variantId={row.variant_id} current={row.quantity} /></article>)}</div></main>;
}
