import { redirect } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { StatusMessage } from '@/components/ui/status-message';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PageHeader } from '@/components/admin/PageHeader';
import { AuditLogFilters } from '@/components/admin/AuditLogFilters';
import { AdminPagination } from '@/components/admin/AdminPagination';
import { AUDIT_ACTIONS, AUDIT_TARGET_TYPES, listAuditLog } from '@/features/admin/audit-log';
import { getCurrentAdmin } from '@/features/auth/server';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { getAdminServerT } from '@/features/i18n/admin-server';
import { formatDateTime } from '@/lib/date';

const PAGE_SIZE = 25;

function first(value: string | string[] | undefined) {
  return typeof value === 'string' ? value : undefined;
}

export default async function AdminAuditLogPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [admin, tData, params] = await Promise.all([getCurrentAdmin(), getAdminServerT(), searchParams]);
  if (!admin) redirect('/login');
  const { t, locale } = tData;
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

  return (
    <div className="flex flex-col gap-4">
      <PageHeader eyebrow={t('adminOperations')} title={t('auditLog')} />
      <AuditLogFilters actions={[...AUDIT_ACTIONS]} targetTypes={[...AUDIT_TARGET_TYPES]} />
      {rows.length === 0 ? (
        <StatusMessage title={t('noAuditEntries')} />
      ) : (
        <section className="grid gap-4">
          <Card className="overflow-hidden p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="whitespace-nowrap">{t('auditWhen')}</TableHead>
                    <TableHead>{t('auditActor')}</TableHead>
                    <TableHead>{t('auditAction')}</TableHead>
                    <TableHead>{t('auditTarget')}</TableHead>
                    <TableHead className="max-w-[18rem]">{t('auditDetails')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="whitespace-nowrap text-sm text-muted-foreground tabular-nums">{formatDateTime(row.createdAt, locale)}</TableCell>
                      <TableCell className="text-sm break-all">{row.actorEmail ?? '—'}</TableCell>
                      <TableCell className="font-medium whitespace-normal">{row.action}</TableCell>
                      <TableCell className="text-sm whitespace-normal break-words">
                        {row.targetType} · <span className="text-muted-foreground font-mono text-xs">{row.targetId.slice(0, 8)}</span>
                      </TableCell>
                      <TableCell className="max-w-[18rem] truncate text-sm text-muted-foreground">{Object.keys(row.metadata).length ? JSON.stringify(row.metadata) : '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>
          <AdminPagination current={current} pageCount={pageCount} total={total} label={t('auditLog')} pageHref={pageHref} />
        </section>
      )}
    </div>
  );
}
