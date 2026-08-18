import { redirect } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { StatusMessage } from '@/components/ui/status-message';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AdminShell } from '@/components/admin/AdminShell';
import { RetryEmailsButton } from '@/components/admin/RetryEmailsButton';
import { listStuckDeliveries } from '@/features/admin/notification-admin';
import { getCurrentAdmin } from '@/features/auth/server';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { getServerT } from '@/features/i18n/server';

const TYPE_KEYS: Record<string, string> = {
  order_received: 'emailOrderReceived',
  payment_confirmed: 'emailPaymentConfirmed',
  payment_failed: 'emailPaymentFailed',
  preparing: 'preparing',
  ready_for_delivery: 'statusReadyForDelivery',
  out_for_delivery: 'statusOutForDelivery',
  delivered: 'statusDelivered',
};

export default async function AdminNotificationsPage() {
  const admin = await getCurrentAdmin();
  if (!admin) redirect('/login');
  const { t } = await getServerT();
  const stuck = await listStuckDeliveries(getAdminSupabase());

  return <AdminShell>
    <p className="text-xs font-bold uppercase tracking-[.16em] text-sage">{t('notificationOperations')}</p>
    <h1 className="font-display text-[clamp(2rem,4vw,3rem)] leading-tight tracking-[-.02em]">{t('notifications')}</h1>
    <RetryEmailsButton />
    <section className="mt-6 grid gap-3">
      <p className="text-xs font-bold uppercase tracking-[.16em] text-sage">{t('stuckEmails')}</p>
      {stuck.length === 0 ? <StatusMessage title={t('noStuckEmails')} /> : (
        <Card><div className="overflow-x-auto"><Table><TableHeader><TableRow>
          <TableHead>{t('orders')}</TableHead><TableHead>{t('emailType')}</TableHead><TableHead>{t('recipient')}</TableHead><TableHead>{t('fulfillment')}</TableHead><TableHead>{t('attempts')}</TableHead><TableHead>{t('createdAt')}</TableHead>
        </TableRow></TableHeader><TableBody>{stuck.map((d) => (
          <TableRow key={d.id}>
            <TableCell className="font-medium">{d.orderNumber ?? '—'}</TableCell>
            <TableCell>{t(TYPE_KEYS[d.type] ?? d.type)}</TableCell>
            <TableCell className="text-sm text-muted-foreground">{d.recipient}</TableCell>
            <TableCell><Badge variant={d.status === 'failed' ? 'destructive' : 'secondary'}>{d.status === 'failed' ? t('statusFailed') : t('statusPending')}</Badge></TableCell>
            <TableCell>{d.attempts}</TableCell>
            <TableCell className="text-sm text-muted-foreground">{new Date(d.createdAt).toLocaleString()}</TableCell>
          </TableRow>
        ))}</TableBody></Table></div></Card>
      )}
    </section>
  </AdminShell>;
}
