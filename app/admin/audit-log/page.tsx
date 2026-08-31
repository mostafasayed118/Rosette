import { redirect } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from '@/components/ui/pagination';
import { StatusMessage } from '@/components/ui/status-message';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PageHeader } from '@/components/admin/PageHeader';
import { AuditLogFilters } from '@/components/admin/AuditLogFilters';
import { AUDIT_ACTIONS, AUDIT_TARGET_TYPES, listAuditLog } from '@/features/admin/audit-log';
import { getCurrentAdmin } from '@/features/auth/server';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { getServerT } from '@/features/i18n/server';
import { formatDateTime } from '@/lib/date';

const PAGE_SIZE = 25;

function first(value: string | string[] | undefined) {
  return typeof value === 'string' ? value : undefined;
}

export default async function AdminAuditLogPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const admin = await getCurrentAdmin();
  if (!admin) redirect('/login');
  const { t, locale } = await getServerT();
  const params = await searchParams;
  const action = AUDIT_ACTIONS.includes(first(params.action) as (typeof AUDIT_ACTIONS)[number])
    ? (first(params.action) as string)
    : undefined;
  const targetType = AUDIT_TARGET_TYPES.includes(first(params.targetType) as (typeof AUDIT_TARGET_TYPES)[number])
    ? (first(params.targetType) as string)
    : undefined;
  const page = Math.max(1, Number.parseInt(first(params.page) ?? '1', 10) || 1);

  const { rows, total } = await listAuditLog(getAdminSupabase(), { action, targetType, page, pageSize: PAGE_SIZE });
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const current = Math.min(page, pageCount);

  function pageHref(p: number) {
    const next = new URLSearchParams();
    if (action) next.set('action', action);
    if (targetType) next.set('targetType', targetType);
    next.set('page', String(p));
    return `/admin/audit-log?${next.toString()}`;
  }

  return <>
    <PageHeader eyebrow={t('adminOperations')} title={t('auditLog')} />
    <AuditLogFilters actions={[...AUDIT_ACTIONS]} targetTypes={[...AUDIT_TARGET_TYPES]} />
    {rows.length === 0 ? <StatusMessage title={t('noAuditEntries')} /> : (
      <section className="grid gap-4">
        <Card><div className="overflow-x-auto"><Table><TableHeader><TableRow>
          <TableHead>{t('auditWhen')}</TableHead>
          <TableHead>{t('auditActor')}</TableHead>
          <TableHead>{t('auditAction')}</TableHead>
          <TableHead>{t('auditTarget')}</TableHead>
          <TableHead>{t('auditDetails')}</TableHead>
        </TableRow></TableHeader><TableBody>{rows.map((row) => (
          <TableRow key={row.id}>
            <TableCell className="whitespace-nowrap text-sm text-muted-foreground">{formatDateTime(row.createdAt, locale)}</TableCell>
            <TableCell className="text-sm">{row.actorEmail ?? '—'}</TableCell>
            <TableCell className="font-medium">{row.action}</TableCell>
            <TableCell className="text-sm">{row.targetType} · <span className="text-muted-foreground">{row.targetId}</span></TableCell>
            <TableCell className="max-w-[18rem] truncate text-sm text-muted-foreground">{Object.keys(row.metadata).length ? JSON.stringify(row.metadata) : '—'}</TableCell>
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
