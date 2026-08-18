import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { StatusMessage } from '@/components/ui/status-message';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AdminShell } from '@/components/admin/AdminShell';
import { AutoRefresh } from '@/components/admin/AutoRefresh';
import { CancelRequestReview } from '@/components/admin/CancelRequestReview';
import { getCurrentAdmin } from '@/features/auth/server';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { getServerT } from '@/features/i18n/server';
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

function formatDate(value: string, locale: string) {
  return new Date(value).toLocaleString(locale === 'ar' ? 'ar-EG' : locale === 'fr' ? 'fr-FR' : 'en-GB');
}

export default async function AdminCancelRequestsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const admin = await getCurrentAdmin();
  if (!admin) redirect('/login');
  const { t, locale } = await getServerT();
  const params = await searchParams;
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

  const tabLink = 'text-sm font-bold underline-offset-4 hover:underline';
  const tabActive = 'text-primary underline';
  const tabIdle = 'text-muted-foreground';

  return <AdminShell>
    <AutoRefresh />
    <p className="text-xs font-bold uppercase tracking-[.16em] text-sage">{t('customerOrders')}</p>
    <h1 className="font-display text-[clamp(2rem,4vw,3rem)] leading-tight tracking-[-.02em]">{t('cancelRequests')}</h1>

    <nav className="mt-4 flex items-center gap-6 border-b pb-2">
      <Link className={`${tabLink} ${showResolved ? tabIdle : tabActive}`} href="/admin/cancel-requests">{t('pendingRequests', { count: pending.length })}</Link>
      <Link className={`${tabLink} ${showResolved ? tabActive : tabIdle}`} href="/admin/cancel-requests?status=resolved">{t('resolvedRequests', { count: resolved.length })}</Link>
    </nav>

    {rows.length === 0 ? <StatusMessage title={showResolved ? t('noResolvedCancelRequests') : t('noCancelRequests')} /> : <Card className="mt-4"><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>{t('orders')}</TableHead><TableHead>{t('cancellationRequestedBy')}</TableHead><TableHead>{t('cancellationReason')}</TableHead>{showResolved ? <><TableHead>{t('decision')}</TableHead><TableHead>{t('reviewedBy')}</TableHead></> : <><TableHead>{t('payment')}</TableHead><TableHead>{t('fulfillment')}</TableHead><TableHead className="text-end">{t('total')}</TableHead><TableHead className="text-end">{t('review')}</TableHead></>}</TableRow></TableHeader><TableBody>{rows.map((request) => (
      <TableRow key={request.id}>
        <TableCell><Link className="font-medium text-primary underline-offset-4 hover:underline" href={`/admin/orders/${request.order?.id ?? ''}`}>{request.order?.display_number ?? '—'}</Link><span className="block text-sm text-muted-foreground">{formatDate(request.createdAt, locale)}</span></TableCell>
        <TableCell>{request.order?.customer_email ?? '—'}</TableCell>
        <TableCell>{request.reason ?? '—'}</TableCell>
        {showResolved ? (
          <TableCell>
            <Badge variant={request.status === 'approved' ? 'success' : 'default'}>{request.status === 'approved' ? t('cancelRequestApproved') : t('cancelRequestRejected')}</Badge>
            <span className="block text-sm text-muted-foreground">{request.reviewedAt ? formatDate(request.reviewedAt, locale) : '—'}</span>
          </TableCell>
        ) : null}
        {showResolved ? (
          <TableCell>{request.reviewedByName ?? '—'}</TableCell>
        ) : (
          <>
            <TableCell><Badge variant={paymentBadgeVariant(request.order?.payment_status ?? '')}>{paymentLabel(request.order?.payment_status ?? 'pending', t)}</Badge></TableCell>
            <TableCell><Badge variant={fulfillmentBadgeVariant(request.order?.fulfillment_status ?? '')}>{fulfillmentLabel(request.order?.fulfillment_status ?? 'confirmed', t)}</Badge></TableCell>
            <TableCell className="text-end">{request.order ? formatMoney(request.order.total_minor, locale) : '—'}</TableCell>
            <TableCell className="text-end"><CancelRequestReview requestId={request.id} /></TableCell>
          </>
        )}
      </TableRow>
    ))}</TableBody></Table></div></Card>}
  </AdminShell>;
}
