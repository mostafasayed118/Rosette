import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/admin/PageHeader';
import { AddPromoForm } from '@/components/admin/AddPromoForm';
import { PromoForm } from '@/components/admin/PromoForm';
import type { PromoInput } from '@/features/admin/promo-actions';
import { getCurrentAdmin } from '@/features/auth/server';
import { getServerT } from '@/features/i18n/server';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { minorToEgp } from '@/features/admin/money';

type PromoRow = { code: string; type: 'percent' | 'fixed'; percent_off: number | null; value_minor: number | null; minimum_order_minor: number; starts_at: string | null; expires_at: string | null; max_uses: number; used_count: number; active: boolean };

export default async function AdminPromosPage() {
  const admin = await getCurrentAdmin();
  if (!admin) redirect('/login');
  const { t } = await getServerT();
  const { data } = await getAdminSupabase().from('promo_codes').select('*').order('created_at', { ascending: false });
  const rows = (data ?? []) as PromoRow[];
  return <>
    <PageHeader eyebrow={t('promoOperations')} title={t('promos')} />
    <AddPromoForm />
    <div className="mt-6 grid gap-4">
      {rows.map((row) => {
        const promo: PromoInput = { code: row.code, type: row.type, percentOff: row.percent_off, valueMinor: row.value_minor, minimumOrderMinor: row.minimum_order_minor, startsAt: row.starts_at, expiresAt: row.expires_at, maxUses: row.max_uses, active: row.active };
        return (
          <Card key={row.code}>
            <CardHeader><CardTitle>{row.code}</CardTitle></CardHeader>
            <CardContent className="grid gap-3">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <Badge variant={row.active ? 'default' : 'secondary'}>{row.active ? t('active') : t('inactive')}</Badge>
                <span className="text-sm text-muted-foreground">{row.type === 'percent' ? `${row.percent_off}%` : `${minorToEgp(row.value_minor ?? 0)} EGP`} · {t('minimumOrderEgp')} {minorToEgp(row.minimum_order_minor)} · {row.used_count}/{row.max_uses === 0 ? '∞' : row.max_uses} {t('uses')}</span>
              </div>
              <PromoForm promo={promo} />
            </CardContent>
          </Card>
        );
      })}
    </div>
    <p className="mt-6"><Link className="text-sm text-primary underline underline-offset-4" href="/admin">{t('backToDashboard')}</Link></p>
  </>;
}
