import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AdminShell } from '@/components/admin/AdminShell';
import { AddPromoForm } from '@/components/admin/AddPromoForm';
import { PromoForm } from '@/components/admin/PromoForm';
import type { PromoInput } from '@/features/admin/promo-actions';
import { getCurrentAdmin } from '@/features/auth/server';
import { getServerT } from '@/features/i18n/server';
import { getAdminSupabase } from '@/lib/supabase/admin';

type PromoRow = { code: string; type: 'percent' | 'fixed'; percent_off: number | null; value_minor: number | null; minimum_order_minor: number; starts_at: string | null; expires_at: string | null; max_uses: number; used_count: number; active: boolean };

export default async function AdminPromosPage() {
  const admin = await getCurrentAdmin();
  if (!admin) redirect('/login');
  const { t } = await getServerT();
  const { data } = await getAdminSupabase().from('promo_codes').select('*').order('created_at', { ascending: false });
  const rows = (data ?? []) as PromoRow[];
  return <AdminShell>
    <p className="eyebrow">{t('promoOperations')}</p>
    <h1>{t('promos')}</h1>
    <AddPromoForm />
    <div className="admin-table">
      {rows.map((row) => {
        const promo: PromoInput = { code: row.code, type: row.type, percentOff: row.percent_off, valueMinor: row.value_minor, minimumOrderMinor: row.minimum_order_minor, startsAt: row.starts_at, expiresAt: row.expires_at, maxUses: row.max_uses, active: row.active };
        return <article className="status-message" key={row.code}>
          <strong>{row.code}</strong>
          <span>{row.type === 'percent' ? `${row.percent_off}%` : `${(row.value_minor ?? 0) / 100} EGP`} · {t('minimumOrderEgp')} {(row.minimum_order_minor / 100).toFixed(2)} · {row.used_count}/{row.max_uses === 0 ? '∞' : row.max_uses} {t('uses')} · {row.active ? t('active') : t('inactive')}</span>
          <PromoForm promo={promo} />
        </article>;
      })}
    </div>
    <p><Link href="/admin">{t('backToDashboard')}</Link></p>
  </AdminShell>;
}
