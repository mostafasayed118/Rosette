import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { StatusMessage } from '@/components/ui/status-message';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AdminShell } from '@/components/admin/AdminShell';
import { NotificationsToolbar } from '@/components/admin/NotificationsToolbar';
import { RetryEmailsButton } from '@/components/admin/RetryEmailsButton';
import { listStuckDeliveries } from '@/features/admin/notification-admin';
import { NOTIFICATION_TYPE_LABEL_KEYS } from '@/features/admin/notification-type-labels';
import { getCurrentAdmin } from '@/features/auth/server';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { getServerT } from '@/features/i18n/server';

const PAGE_SIZE = 10;

function first(value: string | string[] | undefined) {
  return typeof value === 'string' ? value : undefined;
}

export default async function AdminNotificationsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const admin = await getCurrentAdmin();
  if (!admin) redirect('/login');
  const { t } = await getServerT();
  const params = await searchParams;
  const q = first(params.q);
  const status = first(params.status);
  const type = first(params.type);
  const page = Math.max(1, Number.parseInt(first(params.page) ?? '1', 10) || 1);

  const { rows, total } = await listStuckDeliveries(getAdminSupabase(), { q, status, type, page, pageSize: PAGE_SIZE });
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

  return <AdminShell>
    <p className="text-xs font-bold uppercase tracking-[.16em] text-sage">{t('notificationOperations')}</p>
    <h1 className="font-display text-[clamp(2rem,4vw,3rem)] leading-tight tracking-[-.02em]">{t('notifications')}</h1>
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
            <TableCell className="text-sm text-muted-foreground">{new Date(d.createdAt).toLocaleString()}</TableCell>
          </TableRow>
        ))}</TableBody></Table></div></Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">{t('pageOf', { page: current, pages: pageCount })}</p>
          <div className="flex items-center gap-2">
            {current > 1 ? <Button asChild variant="outline" size="sm"><Link href={pageHref(current - 1)}>{t('previous')}</Link></Button> : <Button variant="outline" size="sm" disabled>{t('previous')}</Button>}
            {current < pageCount ? <Button asChild variant="outline" size="sm"><Link href={pageHref(current + 1)}>{t('next')}</Link></Button> : <Button variant="outline" size="sm" disabled>{t('next')}</Button>}
          </div>
        </div>
      </section>
    )}
  </AdminShell>;
}
