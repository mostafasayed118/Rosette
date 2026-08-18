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

type CancelRequestRow = {
  id: string;
  reason: string | null;
  createdAt: string;
  order: { id: string; display_number: string; customer_email: string; total_minor: number; payment_status: string; fulfillment_status: string } | null;
};

export default async function AdminCancelRequestsPage() {
  const admin = await getCurrentAdmin();
  if (!admin) redirect('/login');
  const { t, locale } = await getServerT();
  const { data } = await getAdminSupabase().from('order_cancel_requests')
    .select('id,status,reason,created_at,orders(id,display_number,customer_email,total_minor,payment_status,fulfillment_status)')
    .eq('status', 'pending')
    .order('created_at', { ascending: false });
  const rows: CancelRequestRow[] = ((data ?? []) as Array<{ id: string; reason: string | null; created_at: string; orders: Record<string, any> | null }>).map((request) => {
    const order = request.orders;
    return {
      id: request.id,
      reason: request.reason,
      createdAt: request.created_at,
      order: order ? {
        id: String(order.id), display_number: String(order.display_number), customer_email: String(order.customer_email ?? ''),
        total_minor: Number(order.total_minor ?? 0), payment_status: String(order.payment_status ?? ''), fulfillment_status: String(order.fulfillment_status ?? ''),
      } : null,
    };
  });

  return <AdminShell>
    <AutoRefresh />
    <p className="text-xs font-bold uppercase tracking-[.16em] text-sage">{t('customerOrders')}</p>
    <h1 className="font-display text-[clamp(2rem,4vw,3rem)] leading-tight tracking-[-.02em]">{t('cancelRequests')}</h1>
    {rows.length === 0 ? <StatusMessage title={t('noCancelRequests')} /> : <Card><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>{t('orders')}</TableHead><TableHead>{t('cancellationRequestedBy')}</TableHead><TableHead>{t('cancellationReason')}</TableHead><TableHead>{t('payment')}</TableHead><TableHead>{t('fulfillment')}</TableHead><TableHead className="text-end">{t('total')}</TableHead><TableHead className="text-end">{t('review')}</TableHead></TableRow></TableHeader><TableBody>{rows.map((request) => (
      <TableRow key={request.id}>
        <TableCell><Link className="font-medium text-primary underline-offset-4 hover:underline" href={`/admin/orders/${request.order?.id ?? ''}`}>{request.order?.display_number ?? '—'}</Link><span className="block text-sm text-muted-foreground">{new Date(request.createdAt).toLocaleString(locale === 'ar' ? 'ar-EG' : locale === 'fr' ? 'fr-FR' : 'en-GB')}</span></TableCell>
        <TableCell>{request.order?.customer_email ?? '—'}</TableCell>
        <TableCell>{request.reason ?? '—'}</TableCell>
        <TableCell><Badge variant={paymentBadgeVariant(request.order?.payment_status ?? '')}>{paymentLabel(request.order?.payment_status ?? 'pending', t)}</Badge></TableCell>
        <TableCell><Badge variant={fulfillmentBadgeVariant(request.order?.fulfillment_status ?? '')}>{fulfillmentLabel(request.order?.fulfillment_status ?? 'confirmed', t)}</Badge></TableCell>
        <TableCell className="text-end">{request.order ? formatMoney(request.order.total_minor, locale) : '—'}</TableCell>
        <TableCell className="text-end"><CancelRequestReview requestId={request.id} /></TableCell>
      </TableRow>
    ))}</TableBody></Table></div></Card>}
  </AdminShell>;
}
