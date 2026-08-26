import { redirect } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from '@/components/ui/pagination';
import { StatusMessage } from '@/components/ui/status-message';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PageHeader } from '@/components/admin/PageHeader';
import { NotificationsToolbar } from '@/components/admin/NotificationsToolbar';
import { RetryEmailsButton } from '@/components/admin/RetryEmailsButton';
import { listStuckDeliveries } from '@/features/admin/notification-admin';
import { resolveRetryLimits } from '@/features/notifications/notification-retry';
import { NOTIFICATION_TYPE_LABEL_KEYS } from '@/features/admin/notification-type-labels';
import { getCurrentAdmin } from '@/features/auth/server';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { getServerT } from '@/features/i18n/server';
import { formatDateTime } from '@/lib/date';

const PAGE_SIZE = 10;

function first(value: string | string[] | undefined) {
  return typeof value === 'string' ? value : undefined;
}

export default async function AdminNotificationsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const admin = await getCurrentAdmin();
  if (!admin) redirect('/login');
  const { t, locale } = await getServerT();
  const params = await searchParams;
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

  return <>
    <PageHeader eyebrow={t('notificationOperations')} title={t('notifications')} />
    <RetryEmailsButton />
    <NotificationsToolbar />
    {rows.length === 0 ? <StatusMessage title={t('noStuckEmails')} /> : (
      <section className="grid gap-4">
        <Card><div className="overflow-x-auto"><Table><TableHeader><TableRow>
          <TableHead>{t('orders')}</TableHead><TableHead>{t('emailType')}</TableHead><TableHead>{t('recipient')}</TableHead><TableHead>{t('fulfillment')}</TableHead><TableHead>{t('attempts')}</TableHead><TableHead>{t('createdAt')}</TableHead>
        </TableRow></TableHeader><TableBody>{rows.map((d) => (
          <TableRow key={d.id}>
            <TableCell className="font-medium">{d.orderNumber ?? '—'}</TableCell>
            <TableCell>{t(NOTIFICATION_TYPE_LABEL_KEYS[d.type] ?? d.type)}</TableCell>
            <TableCell className="text-sm text-muted-foreground">{d.recipient}</TableCell>
            <TableCell><Badge variant={d.status === 'failed' ? 'destructive' : 'secondary'}>{d.status === 'failed' ? t('statusFailed') : t('statusPending')}</Badge></TableCell>
            <TableCell>{d.attempts}</TableCell>
            <TableCell className="text-sm text-muted-foreground">{formatDateTime(d.createdAt, locale)}</TableCell>
          </TableRow>
        ))}</TableBody></Table></div></Card>
        <div className="mt-4 flex flex-col items-center gap-2">
          <Pagination>
            <PaginationContent>
              {current > 1 && <PaginationItem><PaginationPrevious href={pageHref(current - 1)} /></PaginationItem>}
              {Array.from({ length: pageCount }, (_, i) => i + 1).map((p) => (
                <PaginationItem key={p}>
                  <PaginationLink href={pageHref(p)} isActive={p === current}>{p}</PaginationLink>
                </PaginationItem>
              ))}
              {current < pageCount && <PaginationItem><PaginationNext href={pageHref(current + 1)} /></PaginationItem>}
            </PaginationContent>
          </Pagination>
          <p className="text-sm text-muted-foreground">{t('pageOf', { page: current, pages: pageCount })}</p>
        </div>
      </section>
    )}
  </>;
}