import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { PageHeader } from '@/components/admin/PageHeader';
import { getCurrentAdmin } from '@/features/auth/server';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { getAdminServerT } from '@/features/i18n/admin-server';
import { formatMoney } from '@/features/money';

export default async function AdminSubscriptionPlansPage() {
  const admin = await getCurrentAdmin();
  if (!admin) redirect('/login');
  const { t, locale } = await getAdminServerT();
  const { data: plans } = await getAdminSupabase().from('subscription_plans').select('*').order('sort_order', { ascending: true });

  return (
    <div className="grid gap-6">
      <PageHeader eyebrow={t('subscriptionsTitle')} title={t('subscriptionPlan')} />
      <div className="flex justify-end">
        <Button asChild><Link href="/admin/subscriptions/plans/new">{t('newPlan')}</Link></Button>
      </div>
      <div className="grid gap-4">
        {((plans ?? []) as any[]).map((plan) => (
          <Card key={String(plan.id)}>
            <CardContent className="flex flex-wrap items-center gap-3">
              <strong className="text-on-surface">{String(plan.name_en)}</strong>
              <span className="font-mono text-sm text-on-surface-variant">{String(plan.slug)}</span>
              <Badge variant={plan.active ? 'default' : 'outline'}>{plan.active ? t('active') : t('inactive')}</Badge>
              <span className="text-sm text-on-surface-variant">
                {((plan.bundle_prices ?? []) as any[]).map((bp) => `${bp.deliveries}×${formatMoney(Number(bp.priceMinor), locale)}`).join(' · ')}
              </span>
              <span className="ml-auto flex gap-2">
                <Button asChild variant="outline" size="sm"><Link href={`/admin/subscriptions/plans/${String(plan.id)}`}>{t('edit')}</Link></Button>
              </span>
            </CardContent>
          </Card>
        ))}
        {((plans ?? []) as any[]).length === 0 ? <p className="text-sm text-on-surface-variant">{t('subscriptionsEmpty')}</p> : null}
      </div>
    </div>
  );
}
