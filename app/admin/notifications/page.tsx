import { redirect } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { StatusMessage } from '@/components/ui/status-message';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PageHeader } from '@/components/admin/PageHeader';
import { NotificationsToolbar } from '@/components/admin/NotificationsToolbar';
import { RetryEmailsButton } from '@/components/admin/RetryEmailsButton';
import { AdminPagination } from '@/components/admin/AdminPagination';
import { listStuckDeliveries } from '@/features/admin/notification-admin';
import { resolveRetryLimits } from '@/features/notifications/notification-retry';
import { NOTIFICATION_TYPE_LABEL_KEYS } from '@/features/admin/notification-type-labels';
import { getCurrentAdmin } from '@/features/auth/server';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { getAdminServerT } from '@/features/i18n/admin-server';
import { formatDateTime } from '@/lib/date';

const PAGE_SIZE = 10;

function first(value: string | string[] | undefined) {
  return typeof value === 'string' ? value : undefined;
}

export default async function AdminNotificationsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [admin, tData, params] = await Promise.all([getCurrentAdmin(), getAdminServerT(), searchParams]);
  if (!admin) redirect('/login');
  const { t, locale } = tData;
  const q = first(params.q);
  const status = first(params.status);
  const type = first(params.type);
  const page = Math.max(1, Number.parseInt(first(params.page) ?? '1', 10) || 1);

  const { rows, total } = await listStuckDeliveries(getAdminSupabase(), { q, status, type, page, pageSize: PAGE_SIZE, ...resolveRetryLimits() });
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const current = Math.min(page, pageCount);

  function pageHref(p: number) {
    const next = new URLSearchParams();
    if (q) next.set('q', q);
    if (status) next.set('status', status);
    if (type) next.set('type', type);
    next.set('page', String(p));
    return `/admin/notifications?${next.toString()}`;
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader eyebrow={t('notificationOperations')} title={t('notifications')} />
      <RetryEmailsButton />
      <NotificationsToolbar />
      {rows.length === 0 ? (
        <StatusMessage title={t('noStuckEmails')} />
      ) : (
        <section className="grid gap-4">
          <Card className="overflow-hidden p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('orders')}</TableHead>
                    <TableHead>{t('emailType')}</TableHead>
                    <TableHead className="min-w-[14rem]">{t('recipient')}</TableHead>
                    <TableHead>{t('fulfillment')}</TableHead>
                    <TableHead>{t('attempts')}</TableHead>
                    <TableHead>{t('createdAt')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((d) => (
                    <TableRow key={d.id}>
                      <TableCell className="font-medium tabular-nums">{d.orderNumber ?? '—'}</TableCell>
                      <TableCell>{t(NOTIFICATION_TYPE_LABEL_KEYS[d.type] ?? d.type)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground break-all">{d.recipient}</TableCell>
                      <TableCell>
                        <Badge variant={d.status === 'failed' ? 'destructive' : 'secondary'}>{d.status === 'failed' ? t('statusFailed') : t('statusPending')}</Badge>
                      </TableCell>
                      <TableCell className="tabular-nums">{d.attempts}</TableCell>
                      <TableCell className="text-sm text-muted-foreground tabular-nums">{formatDateTime(d.createdAt, locale)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>
          <AdminPagination current={current} pageCount={pageCount} total={total} label={t('notifications')} pageHref={pageHref} />
        </section>
      )}
    </div>
  );
}