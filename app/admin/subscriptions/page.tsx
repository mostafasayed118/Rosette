import { redirect } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/admin/PageHeader';
import { getCurrentAdmin } from '@/features/auth/server';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { getServerT } from '@/features/i18n/server';
import { listAdminSubscriptions, getAdminTimeline } from '@/features/subscriptions/admin-actions';
import { AdminSubscribersTable, type AdminSubscriberRow } from '@/features/subscriptions/AdminSubscribersTable';
import { AdminTimeline, type AdminTimelineRow } from '@/features/subscriptions/AdminTimeline';

export default async function AdminSubscriptionsPage() {
  const admin = await getCurrentAdmin();
  if (!admin) redirect('/login');
  const { t } = await getServerT();
  const client = getAdminSupabase();
  const [rows, timeline] = await Promise.all([
    listAdminSubscriptions(client, admin, {}),
    getAdminTimeline(client),
  ]);

  return (
    <div className="grid gap-6">
      <PageHeader eyebrow={t('subscriptionsTitle')} title={t('subscriptionManage')} />
      <Card>
        <CardHeader><CardTitle>{t('subscriptionsTitle')}</CardTitle></CardHeader>
        <CardContent>
          <AdminSubscribersTable rows={rows as AdminSubscriberRow[]} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>{t('subscriptionNextDelivery')}</CardTitle></CardHeader>
        <CardContent>
          <AdminTimeline rows={timeline as AdminTimelineRow[]} />
        </CardContent>
      </Card>
    </div>
  );
}
