import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { StatusMessage } from '@/components/ui/status-message';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AdminShell } from '@/components/admin/AdminShell';
import { AutoRefresh } from '@/components/admin/AutoRefresh';
import { ChangeRequestReview } from '@/components/admin/ChangeRequestReview';
import { getCurrentAdmin } from '@/features/auth/server';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { getServerT } from '@/features/i18n/server';
import { formatMoney } from '@/features/money';
import { fulfillmentBadgeVariant, fulfillmentLabel, paymentBadgeVariant, paymentLabel } from '@/features/admin/status-labels';
import { parseChangeRequestDiff, applyChanges, type ChangeRequestDiff } from '@/features/orders/change-request';

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

function formatDate(value: string, locale: string) {
  return new Date(value).toLocaleString(locale === 'ar' ? 'ar-EG' : locale === 'fr' ? 'fr-FR' : 'en-GB');
}

export default async function AdminChangeRequestsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const admin = await getCurrentAdmin();
  if (!admin) redirect('/login');
  const { t, locale } = await getServerT();
  const params = await searchParams;
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

  const tabLink = 'text-sm font-bold underline-offset-4 hover:underline';
  const tabActive = 'text-primary underline';
  const tabIdle = 'text-muted-foreground';

  return <AdminShell>
    <AutoRefresh />
    <p className="text-xs font-bold uppercase tracking-[.16em] text-sage">{t('customerOrders')}</p>
    <h1 className="font-display text-[clamp(2rem,4vw,3rem)] leading-tight tracking-[-.02em]">{t('changeRequests')}</h1>

    <nav className="mt-4 flex items-center gap-6 border-b pb-2">
      <Link className={`${tabLink} ${showResolved ? tabIdle : tabActive}`} href="/admin/change-requests">{t('pendingRequests', { count: active.length })}</Link>
      <Link className={`${tabLink} ${showResolved ? tabActive : tabIdle}`} href="/admin/change-requests?status=resolved">{t('resolvedRequests', { count: resolved.length })}</Link>
    </nav>

    {rows.length === 0 ? <StatusMessage title={showResolved ? t('noChangeRequests') : t('noPendingChangeRequests')} /> : <Card className="mt-4"><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>{t('orders')}</TableHead><TableHead>{t('cancellationRequestedBy')}</TableHead><TableHead>{t('requestedChanges')}</TableHead><TableHead>{t('changeDelta')}</TableHead>{showResolved ? <><TableHead>{t('decision')}</TableHead><TableHead>{t('reviewedBy')}</TableHead></> : <><TableHead>{t('payment')}</TableHead><TableHead>{t('fulfillment')}</TableHead><TableHead className="text-end">{t('review')}</TableHead></>}</TableRow></TableHeader><TableBody>{rows.map((request) => (
      <TableRow key={request.id}>
        <TableCell><Link className="font-medium text-primary underline-offset-4 hover:underline" href={`/admin/orders/${request.order?.id ?? ''}`}>{request.order?.display_number ?? '—'}</Link><span className="block text-sm text-muted-foreground">{formatDate(request.createdAt, locale)}</span></TableCell>
        <TableCell>{request.order?.customer_email ?? '—'}</TableCell>
        <TableCell><ul className="grid list-none gap-0 p-0 text-sm">{request.summary.map((line) => <li key={line}>{line}</li>)}</ul>{request.awaitingPayment ? <Badge variant="default">{t('changeAwaitingPayment')}</Badge> : null}</TableCell>
        <TableCell>{request.deltaLabel}</TableCell>
        {showResolved ? (
          <>
            <TableCell><Badge variant={request.status === 'applied' ? 'success' : 'default'}>{request.status === 'applied' ? t('changeApplied') : t('changeRejected')}</Badge><span className="block text-sm text-muted-foreground">{request.reviewedAt ? formatDate(request.reviewedAt, locale) : '—'}</span></TableCell>
            <TableCell>{request.reviewedByName ?? '—'}</TableCell>
          </>
        ) : (
          <>
            <TableCell><Badge variant={paymentBadgeVariant(request.order?.payment_status ?? '')}>{paymentLabel(request.order?.payment_status ?? 'pending', t)}</Badge></TableCell>
            <TableCell><Badge variant={fulfillmentBadgeVariant(request.order?.fulfillment_status ?? '')}>{fulfillmentLabel(request.order?.fulfillment_status ?? 'confirmed', t)}</Badge></TableCell>
            <TableCell className="text-end"><ChangeRequestReview requestId={request.id} /></TableCell>
          </>
        )}
      </TableRow>
    ))}</TableBody></Table></div></Card>}
  </AdminShell>;
}
