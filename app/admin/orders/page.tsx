import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { StatusMessage } from '@/components/ui/status-message';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PageHeader } from '@/components/admin/PageHeader';
import { OrderListToolbar } from '@/components/admin/OrderListToolbar';
import { listAdminOrders } from '@/features/admin/repositories';
import { getCurrentAdmin } from '@/features/auth/server';
import { getAdminServerT } from '@/features/i18n/admin-server';
import { formatMoney } from '@/features/money';
import { fulfillmentBadgeVariant, fulfillmentLabel, paymentBadgeVariant, paymentLabel } from '@/features/admin/status-labels';

function first(value: string | string[] | undefined) {
  return typeof value === 'string' ? value : undefined;
}

export default async function AdminOrdersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [admin, tData, params] = await Promise.all([getCurrentAdmin(), getAdminServerT(), searchParams]);
  if (!admin) redirect('/login');
  const { t, locale } = tData;
  const rows = await listAdminOrders({ q: first(params.q), payment: first(params.payment), fulfillment: first(params.fulfillment) });

  return (
    <div className="flex flex-col gap-4">
      <PageHeader eyebrow={t('adminEyebrow')} title={t('orders')} />
      <OrderListToolbar />
      {rows.length === 0 ? (
        <StatusMessage title={t('noOrdersMatch')} />
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[10rem]">{t('orders')}</TableHead>
                  <TableHead className="min-w-[14rem]">{t('recipient')}</TableHead>
                  <TableHead>{t('payment')}</TableHead>
                  <TableHead>{t('fulfillment')}</TableHead>
                  <TableHead className="text-end">{t('total')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((order) => (
                  <TableRow key={order.id}>
                    <TableCell>
                      <Link className="font-medium text-primary underline-offset-4 hover:underline" href={`/admin/orders/${order.id}`} prefetch>
                        {order.displayNumber}
                      </Link>
                    </TableCell>
                    <TableCell className="whitespace-normal break-words">
                      <span className="block font-medium">{order.recipientName}</span>
                      <span className="block text-sm text-muted-foreground break-all">{order.customerEmail}</span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={paymentBadgeVariant(order.paymentStatus)}>{paymentLabel(order.paymentStatus, t)}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={fulfillmentBadgeVariant(order.fulfillmentStatus)}>{fulfillmentLabel(order.fulfillmentStatus, t)}</Badge>
                    </TableCell>
                    <TableCell className="text-end tabular-nums">{formatMoney(order.totalMinor, locale)}</TableCell>
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