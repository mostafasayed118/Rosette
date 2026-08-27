import { notFound, redirect } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/admin/PageHeader';
import { getCurrentAdmin } from '@/features/auth/server';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { getServerT } from '@/features/i18n/server';
import { AdminPlanForm } from '@/features/subscriptions/AdminPlanForm';

type PageParams = { params: Promise<{ id: string }> };

export default async function AdminEditSubscriptionPlanPage({ params }: PageParams) {
  const admin = await getCurrentAdmin();
  if (!admin) redirect('/login');
  const { id } = await params;
  const { t } = await getServerT();
  const { data: plan } = await getAdminSupabase().from('subscription_plans').select('*').eq('id', id).maybeSingle();
  if (!plan) notFound();

  return (
    <div className="grid gap-6">
      <PageHeader eyebrow={t('subscriptionsTitle')} title={String(plan.name_en)} />
      <Card>
        <CardHeader><CardTitle>{t('subscriptionPlan')}</CardTitle></CardHeader>
        <CardContent>
          <AdminPlanForm initial={{
            id: String(plan.id), slug: String(plan.slug),
            nameEn: String(plan.name_en ?? ''), nameAr: String(plan.name_ar ?? ''), nameFr: String(plan.name_fr ?? ''),
            descriptionEn: String(plan.description_en ?? ''), descriptionAr: String(plan.description_ar ?? ''), descriptionFr: String(plan.description_fr ?? ''),
            frequencies: (plan.frequencies ?? []) as string[],
            bundlePrices: ((plan.bundle_prices ?? []) as any[]).map((bp) => ({ deliveries: Number(bp.deliveries), priceMinor: Number(bp.priceMinor) })),
            productId: plan.product_id ? String(plan.product_id) : null, active: plan.active !== false, sortOrder: Number(plan.sort_order ?? 0),
          }} />
        </CardContent>
      </Card>
    </div>
  );
}
