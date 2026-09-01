import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { StatusMessage } from '@/components/ui/status-message';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PageHeader } from '@/components/admin/PageHeader';
import { AutoRefresh } from '@/components/admin/AutoRefresh';
import { ChangeRequestReview } from '@/components/admin/ChangeRequestReview';
import { RequestTabs } from '@/components/admin/RequestTabs';
import { getCurrentAdmin } from '@/features/auth/server';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { getAdminServerT } from '@/features/i18n/admin-server';
import { formatDateTime } from '@/lib/date';
import { formatMoney } from '@/features/money';
import { fulfillmentBadgeVariant, fulfillmentLabel, paymentBadgeVariant, paymentLabel } from '@/features/admin/status-labels';
import { parseChangeRequestDiff, applyChanges, type ChangeRequestDiff } from '@/features/order-mutations/change-request';

type ChangeRequestRow = {
  id: string;
  status: 'pending' | 'approved' | 'applied' | 'rejected';
  reason: string | null;
  deltaMinor: number | null;
  createdAt: string;
  reviewedAt: string | null;
  reviewedByName: string | null;
  summary: string[];
  deltaLabel: string;
  awaitingPayment: boolean;
  order: { id: string; display_number: string; customer_email: string; payment_status: string; fulfillment_status: string } | null;
};

const FIELD_LABELS: Array<[keyof ChangeRequestDiff, string]> = [
  ['delivery_date', 'deliveryDate'],
  ['delivery_window', 'deliveryWindow'],
  ['recipient_name', 'recipientName'],
  ['recipient_phone', 'recipientPhone'],
  ['delivery_address', 'address'],
];

function buildSummary(diff: ChangeRequestDiff, order: Record<string, any>, t: (key: string) => string): string[] {
  const lines: string[] = [];
  for (const [key, labelKey] of FIELD_LABELS) {
    const value = diff[key];
    if (value !== undefined) lines.push(`${t(labelKey)} → ${String(value)}`);
  }
  for (const change of diff.items ?? []) {
    const item = (order.order_items ?? []).find((row: any) => String(row.id) === String(change.id));
    const name = item ? String(item.product_name_en ?? '') : change.id;
    if (change.quantity !== undefined) lines.push(`${t('quantity')} ${name}: ${Number(item?.quantity ?? '?')} → ${change.quantity}`);
    if (change.gift_message !== undefined) lines.push(`${t('giftNote')} ${name}`);
  }
  return lines;
}

export default async function AdminChangeRequestsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [admin, tData, params] = await Promise.all([getCurrentAdmin(), getAdminServerT(), searchParams]);
  if (!admin) redirect('/login');
  const { t, locale } = tData;
  const showResolved = params.status === 'resolved';

  const supabase = getAdminSupabase();
  const orderSelect = 'id,display_number,customer_email,payment_status,fulfillment_status,total_minor,subtotal_minor,delivery_fee_minor,discount_minor';
  const [{ data: activeRows }, { data: resolvedRows }] = await Promise.all([
    supabase.from('order_change_requests').select(`id,status,reason,changes,delta_minor,created_at,reviewed_at,reviewed_by,orders(${orderSelect},order_items(id,unit_price_minor,quantity,gift_message,product_name_en))`).in('status', ['pending', 'approved']).order('created_at', { ascending: false }).limit(100),
    supabase.from('order_change_requests').select(`id,status,reason,changes,delta_minor,created_at,reviewed_at,reviewed_by,orders(${orderSelect})`).in('status', ['applied', 'rejected']).order('reviewed_at', { ascending: false }).limit(100),
  ]);

  const reviewerIds = [...new Set([...(activeRows ?? []), ...(resolvedRows ?? [])].map((row) => row?.reviewed_by).filter((value): value is string => Boolean(value)))];
  const { data: reviewerRows } = reviewerIds.length ? await supabase.from('profiles').select('id,display_name').in('id', reviewerIds) : { data: [] };
  const reviewerNames = new Map((reviewerRows ?? []).map((profile) => [String(profile.id), String(profile.display_name ?? profile.id)]));

  const mapRow = (row: Record<string, any>): ChangeRequestRow => {
    const order = row.orders as Record<string, any> | null;
    const parsed = parseChangeRequestDiff(row.changes);
    let deltaLabel = '—';
    let summary: string[] = [];
    if (parsed.ok && order) {
      summary = buildSummary(parsed.diff, order, t);
      const computed = applyChanges({ subtotal_minor: Number(order.subtotal_minor), delivery_fee_minor: Number(order.delivery_fee_minor), discount_minor: order.discount_minor != null ? Number(order.discount_minor) : null, total_minor: Number(order.total_minor) }, (order.order_items ?? []).map((item: any) => ({ id: String(item.id), unit_price_minor: Number(item.unit_price_minor), quantity: Number(item.quantity), gift_message: String(item.gift_message ?? '') })), parsed.diff);
      if (computed.ok) {
        const sign = computed.deltaMinor > 0 ? '+' : computed.deltaMinor < 0 ? '−' : '';
        deltaLabel = `${formatMoney(order.total_minor, locale)} → ${formatMoney(computed.totalMinor, locale)}${sign ? ` · ${sign}${formatMoney(Math.abs(computed.deltaMinor), locale)}` : ''}`;
      }
    }
    return {
      id: String(row.id),
      status: row.status as ChangeRequestRow['status'],
      reason: row.reason ? String(row.reason) : null,
      deltaMinor: row.delta_minor != null ? Number(row.delta_minor) : null,
      createdAt: String(row.created_at),
      reviewedAt: row.reviewed_at ? String(row.reviewed_at) : null,
      reviewedByName: row.reviewed_by ? reviewerNames.get(String(row.reviewed_by)) ?? null : null,
      summary,
      deltaLabel,
      awaitingPayment: row.status === 'approved',
      order: order ? { id: String(order.id), display_number: String(order.display_number), customer_email: String(order.customer_email ?? ''), payment_status: String(order.payment_status ?? ''), fulfillment_status: String(order.fulfillment_status ?? '') } : null,
    };
  };

  const active = (activeRows ?? []).map(mapRow);
  const resolved = (resolvedRows ?? []).map(mapRow);
  const rows = showResolved ? resolved : active;

  const hasPending = active.some((r) => r.status === 'pending');

  return (
    <div className="flex flex-col gap-4">
      <PageHeader eyebrow={t('customerOrders')} title={t('changeRequests')} />
      <AutoRefresh enabled={hasPending} intervalMs={60000} />
      <RequestTabs
        basePath="/admin/change-requests"
        tabs={[
          { value: 'pending', label: t('pendingRequests', { count: active.length }) },
          { value: 'resolved', label: t('resolvedRequests', { count: resolved.length }) },
        ]}
        current={showResolved ? 'resolved' : 'pending'}
      />

      {rows.length === 0 ? (
        <StatusMessage title={showResolved ? t('noChangeRequests') : t('noPendingChangeRequests')} />
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('orders')}</TableHead>
                  <TableHead className="hidden md:table-cell">{t('cancellationRequestedBy')}</TableHead>
                  <TableHead className="min-w-[16rem]">{t('requestedChanges')}</TableHead>
                  <TableHead className="hidden sm:table-cell">{t('changeDelta')}</TableHead>
                  {showResolved ? (
                    <>
                      <TableHead>{t('decision')}</TableHead>
                      <TableHead>{t('reviewedBy')}</TableHead>
                    </>
                  ) : (
                    <>
                      <TableHead className="hidden lg:table-cell">{t('payment')}</TableHead>
                      <TableHead className="hidden lg:table-cell">{t('fulfillment')}</TableHead>
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
                    <TableCell>
                      <ul className="grid list-none gap-0 p-0 text-sm">
                        {request.summary.map((line) => (
                          <li key={line} className="whitespace-normal break-words">
                            {line}
                          </li>
                        ))}
                      </ul>
                      {request.awaitingPayment ? <Badge variant="default" className="mt-1">{t('changeAwaitingPayment')}</Badge> : null}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell whitespace-normal break-words text-sm tabular-nums">{request.deltaLabel}</TableCell>
                    {showResolved ? (
                      <>
                        <TableCell>
                          <Badge variant={request.status === 'applied' ? 'success' : 'default'}>{request.status === 'applied' ? t('changeApplied') : t('changeRejected')}</Badge>
                          <span className="block text-sm text-muted-foreground tabular-nums">{request.reviewedAt ? formatDateTime(request.reviewedAt, locale) : '—'}</span>
                        </TableCell>
                        <TableCell>{request.reviewedByName ?? '—'}</TableCell>
                      </>
                    ) : (
                      <>
                        <TableCell className="hidden lg:table-cell">
                          <Badge variant={paymentBadgeVariant(request.order?.payment_status ?? '')}>{paymentLabel(request.order?.payment_status ?? 'pending', t)}</Badge>
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">
                          <Badge variant={fulfillmentBadgeVariant(request.order?.fulfillment_status ?? '')}>{fulfillmentLabel(request.order?.fulfillment_status ?? 'confirmed', t)}</Badge>
                        </TableCell>
                        <TableCell className="text-end">
                          <ChangeRequestReview requestId={request.id} />
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
