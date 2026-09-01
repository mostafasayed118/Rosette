import { redirect } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/admin/PageHeader';
import { getCurrentAdmin } from '@/features/auth/server';
import { getAdminServerT } from '@/features/i18n/admin-server';
import { AdminPlanForm } from '@/features/subscriptions/AdminPlanForm';

export default async function AdminNewSubscriptionPlanPage() {
  const admin = await getCurrentAdmin();
  if (!admin) redirect('/login');
  const { t } = await getAdminServerT();
  return (
    <div className="grid gap-6">
      <PageHeader eyebrow={t('subscriptionsTitle')} title={t('newPlan')} />
      <Card>
        <CardHeader><CardTitle>{t('subscriptionPlan')}</CardTitle></CardHeader>
        <CardContent><AdminPlanForm /></CardContent>
      </Card>
    </div>
  );
}
