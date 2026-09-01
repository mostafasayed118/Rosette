import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { StatusMessage } from '@/components/ui/status-message';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PageHeader } from '@/components/admin/PageHeader';
import { AutoRefresh } from '@/components/admin/AutoRefresh';
import { CancelRequestReview } from '@/components/admin/CancelRequestReview';
import { RequestTabs } from '@/components/admin/RequestTabs';
import { getCurrentAdmin } from '@/features/auth/server';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { getAdminServerT } from '@/features/i18n/admin-server';
import { formatDateTime } from '@/lib/date';
import { formatMoney } from '@/features/money';
import { fulfillmentBadgeVariant, fulfillmentLabel, paymentBadgeVariant, paymentLabel } from '@/features/admin/status-labels';

type OrderInfo = { id: string; display_number: string; customer_email: string; total_minor: number; payment_status: string; fulfillment_status: string };
type CancelRequestRow = {
  id: string;
  status: 'approved' | 'rejected';
  reason: string | null;
  createdAt: string;
  reviewedAt: string | null;
  reviewedByName: string | null;
  order: OrderInfo | null;
};

function mapRows(rows: Array<Record<string, any>>, reviewerNames: Map<string, string>): CancelRequestRow[] {
  return rows.map((request) => {
    const order = request.orders as Record<string, any> | null;
    return {
      id: String(request.id),
      status: request.status === 'rejected' ? 'rejected' : 'approved',
      reason: request.reason ? String(request.reason) : null,
      createdAt: String(request.created_at),
      reviewedAt: request.reviewed_at ? String(request.reviewed_at) : null,
      reviewedByName: request.reviewed_by ? reviewerNames.get(String(request.reviewed_by)) ?? null : null,
      order: order ? {
        id: String(order.id), display_number: String(order.display_number), customer_email: String(order.customer_email ?? ''),
        total_minor: Number(order.total_minor ?? 0), payment_status: String(order.payment_status ?? ''), fulfillment_status: String(order.fulfillment_status ?? ''),
      } : null,
    };
  });
}

export default async function AdminCancelRequestsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [admin, tData, params] = await Promise.all([getCurrentAdmin(), getAdminServerT(), searchParams]);
  if (!admin) redirect('/login');
  const { t, locale } = tData;
  const showResolved = params.status === 'resolved';

  const supabase = getAdminSupabase();
  const orderSelect = 'id,display_number,customer_email,total_minor,payment_status,fulfillment_status';
  const [{ data: pendingRows }, { data: resolvedRows }] = await Promise.all([
    supabase.from('order_cancel_requests').select(`id,status,reason,created_at,reviewed_at,reviewed_by,orders(${orderSelect})`).eq('status', 'pending').order('created_at', { ascending: false }).limit(100),
    supabase.from('order_cancel_requests').select(`id,status,reason,created_at,reviewed_at,reviewed_by,orders(${orderSelect})`).in('status', ['approved', 'rejected']).order('reviewed_at', { ascending: false }).limit(100),
  ]);

  const reviewerIds = [...new Set([...(resolvedRows ?? []), ...(pendingRows ?? [])].map((row) => row?.reviewed_by).filter((value): value is string => Boolean(value)))];
  const { data: reviewerRows } = reviewerIds.length ? await supabase.from('profiles').select('id,display_name').in('id', reviewerIds) : { data: [] };
  const reviewerNames = new Map((reviewerRows ?? []).map((profile) => [String(profile.id), String(profile.display_name ?? profile.id)]));

  const pending = mapRows(pendingRows ?? [], reviewerNames);
  const resolved = mapRows(resolvedRows ?? [], reviewerNames);
  const rows = showResolved ? resolved : pending;

  const hasPending = pending.length > 0;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader eyebrow={t('customerOrders')} title={t('cancelRequests')} />
      <AutoRefresh enabled={hasPending} intervalMs={60000} />
      <RequestTabs
        basePath="/admin/cancel-requests"
        tabs={[
          { value: 'pending', label: t('pendingRequests', { count: pending.length }) },
          { value: 'resolved', label: t('resolvedRequests', { count: resolved.length }) },
        ]}
        current={showResolved ? 'resolved' : 'pending'}
      />

      {rows.length === 0 ? (
        <StatusMessage title={showResolved ? t('noResolvedCancelRequests') : t('noCancelRequests')} />
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('orders')}</TableHead>
                  <TableHead className="hidden md:table-cell">{t('cancellationRequestedBy')}</TableHead>
                  <TableHead className="max-w-[20rem]">{t('cancellationReason')}</TableHead>
                  {showResolved ? (
                    <>
                      <TableHead>{t('decision')}</TableHead>
                      <TableHead>{t('reviewedBy')}</TableHead>
                    </>
                  ) : (
                    <>
                      <TableHead className="hidden lg:table-cell">{t('payment')}</TableHead>
                      <TableHead className="hidden lg:table-cell">{t('fulfillment')}</TableHead>
                      <TableHead className="text-end">{t('total')}</TableHead>
                      <TableHead className="text-end">{t('review')}</TableHead>
                    </>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((request) => (
                  <TableRow key={request.id}>
                    <TableCell>
                      <Link className="font-medium text-primary underline-offset-4 hover:underline" href={`/admin/orders/${request.order?.id ?? ''}`} prefetch>
                        {request.order?.display_number ?? '—'}
                      </Link>
                      <span className="block text-sm text-muted-foreground tabular-nums">{formatDateTime(request.createdAt, locale)}</span>
                    </TableCell>
                    <TableCell className="hidden md:table-cell break-all text-sm">{request.order?.customer_email ?? '—'}</TableCell>
                    <TableCell className="max-w-[20rem] whitespace-normal break-words text-sm">{request.reason ?? '—'}</TableCell>
                    {showResolved ? (
                      <TableCell>
                        <Badge variant={request.status === 'approved' ? 'success' : 'default'}>{request.status === 'approved' ? t('cancelRequestApproved') : t('cancelRequestRejected')}</Badge>
                        <span className="block text-sm text-muted-foreground tabular-nums">{request.reviewedAt ? formatDateTime(request.reviewedAt, locale) : '—'}</span>
                      </TableCell>
                    ) : null}
                    {showResolved ? (
                      <TableCell>{request.reviewedByName ?? '—'}</TableCell>
                    ) : (
                      <>
                        <TableCell className="hidden lg:table-cell">
                          <Badge variant={paymentBadgeVariant(request.order?.payment_status ?? '')}>{paymentLabel(request.order?.payment_status ?? 'pending', t)}</Badge>
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">
                          <Badge variant={fulfillmentBadgeVariant(request.order?.fulfillment_status ?? '')}>{fulfillmentLabel(request.order?.fulfillment_status ?? 'confirmed', t)}</Badge>
                        </TableCell>
                        <TableCell className="text-end tabular-nums">{request.order ? formatMoney(request.order.total_minor, locale) : '—'}</TableCell>
                        <TableCell className="text-end">
                          <CancelRequestReview requestId={request.id} />
                        </TableCell>
                      </>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}
    </div>
  );
}
