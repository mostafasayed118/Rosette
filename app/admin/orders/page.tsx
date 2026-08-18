import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { StatusMessage } from '@/components/ui/status-message';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AdminShell } from '@/components/admin/AdminShell';
import { OrderListToolbar } from '@/components/admin/OrderListToolbar';
import { buildOrderListQuery } from '@/features/admin/order-list-query';
import { getCurrentAdmin } from '@/features/auth/server';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { getServerT } from '@/features/i18n/server';
import { formatMoney } from '@/features/money';
import { fulfillmentBadgeVariant, fulfillmentLabel, paymentBadgeVariant, paymentLabel } from '@/features/admin/status-labels';

function first(value: string | string[] | undefined) {
  return typeof value === 'string' ? value : undefined;
}

export default async function AdminOrdersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const admin = await getCurrentAdmin();
  if (!admin) redirect('/login');
  const { t, locale } = await getServerT();
  const params = await searchParams;
  const constraints = buildOrderListQuery({ q: first(params.q), payment: first(params.payment), fulfillment: first(params.fulfillment) });

  let query = getAdminSupabase().from('orders').select('id,display_number,customer_email,recipient_name,total_minor,payment_status,fulfillment_status,created_at').order('created_at', { ascending: false }).limit(100);
  if (constraints.search) query = query.or(`display_number.ilike.%${constraints.search}%,customer_email.ilike.%${constraints.search}%,customer_phone.ilike.%${constraints.search}%`);
  if (constraints.paymentStatus) query = query.eq('payment_status', constraints.paymentStatus);
  if (constraints.fulfillmentStatus) query = query.eq('fulfillment_status', constraints.fulfillmentStatus);
  const { data } = await query;

  const rows = (data ?? []) as Array<{ id: string; display_number: string; customer_email: string; recipient_name: string; total_minor: number; payment_status: string; fulfillment_status: string }>;

  return <AdminShell>
    <p className="text-xs font-bold uppercase tracking-[.16em] text-sage">{t('customerOrders')}</p>
    <h1 className="font-display text-[clamp(2rem,4vw,3rem)] leading-tight tracking-[-.02em]">{t('orders')}</h1>
    <OrderListToolbar />
    {rows.length === 0 ? <StatusMessage title={t('noOrdersMatch')} /> : <Card><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>{t('orders')}</TableHead><TableHead>{t('recipient')}</TableHead><TableHead>{t('payment')}</TableHead><TableHead>{t('fulfillment')}</TableHead><TableHead className="text-end">{t('total')}</TableHead></TableRow></TableHeader><TableBody>{rows.map((order) => (
      <TableRow key={order.id}>
        <TableCell><Link className="font-medium text-primary underline-offset-4 hover:underline" href={`/admin/orders/${order.id}`}>{order.display_number}</Link></TableCell>
        <TableCell><span className="block">{order.recipient_name}</span><span className="block text-sm text-muted-foreground">{order.customer_email}</span></TableCell>
        <TableCell><Badge variant={paymentBadgeVariant(order.payment_status)}>{paymentLabel(order.payment_status, t)}</Badge></TableCell>
        <TableCell><Badge variant={fulfillmentBadgeVariant(order.fulfillment_status)}>{fulfillmentLabel(order.fulfillment_status, t)}</Badge></TableCell>
        <TableCell className="text-end">{formatMoney(order.total_minor, locale)}</TableCell>
      </TableRow>
    ))}</TableBody></Table></div></Card>}
  </AdminShell>;
}