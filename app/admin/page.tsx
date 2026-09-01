import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ClipboardList, PackageCheck, TrendingUp, Wallet } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { StatusMessage } from '@/components/ui/status-message';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PageHeader } from '@/components/admin/PageHeader';
import { LOW_STOCK_THRESHOLD } from '@/features/admin/dashboard-stats';
import { getDashboardStats } from '@/features/admin/repositories';
import { getCurrentAdmin } from '@/features/auth/server';
import { getAdminServerT } from '@/features/i18n/admin-server';
import { formatMoney } from '@/features/money';
import { fulfillmentBadgeVariant, fulfillmentLabel } from '@/features/admin/status-labels';

function LowStockBadge({ available }: { available: number }) {
  const variant = available === 0 ? 'destructive' as const : available <= 1 ? 'warning' as const : available <= LOW_STOCK_THRESHOLD ? 'secondary' as const : 'secondary' as const;
  const dot = available === 0 ? 'bg-destructive' : available <= 1 ? 'bg-warning' : 'bg-muted-foreground';
  return (
    <span className="inline-flex items-center gap-2">
      <span className={`h-2 w-2 rounded-full ${dot}`} aria-hidden />
      <Badge variant={variant}>{available} {available === 1 ? 'unit' : 'units'}</Badge>
    </span>
  );
}

export default async function AdminPage() {
  const [admin, tData, stats] = await Promise.all([getCurrentAdmin(), getAdminServerT(), getDashboardStats()]);
  if (!admin) redirect('/login');
  const { t, locale } = tData;
  const pipelineEntries = Object.entries(stats.pipeline) as Array<[string, number]>;
  const maxPipeline = Math.max(1, ...pipelineEntries.map(([, count]) => count));
  const subTiles = { activeSubscriptions: stats.activeSubscriptions, deliveriesThisWeek: stats.deliveriesThisWeek };
  const awaitingHigh = stats.awaitingFulfillment > 10;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={t('adminEyebrow')}
        title={t('adminDashboard')}
        description={t('signedInAs', { role: admin.role })}
        actions={<Link className="text-sm font-medium text-primary underline underline-offset-4" href="/admin/orders">{t('openOrders')}</Link>}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card className={awaitingHigh ? 'border-l-4 border-l-warning' : 'border-l-4 border-l-primary'}>
          <CardHeader className="flex flex-row items-center justify-between gap-4">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t('awaitingFulfillment')}</CardTitle>
            <span className={`grid h-10 w-10 place-items-center rounded-full ${awaitingHigh ? 'bg-warning/15 text-warning' : 'bg-primary/10 text-primary'}`}>
              <ClipboardList className="h-5 w-5" />
            </span>
          </CardHeader>
          <CardContent>
            <p className="font-display text-3xl tabular-nums">{stats.awaitingFulfillment}</p>
            <Link className="mt-1 inline-block text-sm text-primary underline underline-offset-4" href="/admin/orders">{t('openOrders')}</Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-4">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t('revenueToday')}</CardTitle>
            <span className="grid h-10 w-10 place-items-center rounded-full bg-success/10 text-success">
              <Wallet className="h-5 w-5" />
            </span>
          </CardHeader>
          <CardContent><p className="font-display text-3xl tabular-nums">{formatMoney(stats.revenueTodayMinor, locale)}</p></CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-4">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t('revenueAllTime')}</CardTitle>
            <span className="grid h-10 w-10 place-items-center rounded-full bg-accent text-primary">
              <TrendingUp className="h-5 w-5" />
            </span>
          </CardHeader>
          <CardContent><p className="font-display text-3xl tabular-nums">{formatMoney(stats.revenueAllTimeMinor, locale)}</p></CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-4">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t('subscriptionsTitle')}</CardTitle>
            <span className="grid h-10 w-10 place-items-center rounded-full bg-secondary text-secondary-foreground">
              <PackageCheck className="h-5 w-5" />
            </span>
          </CardHeader>
          <CardContent>
            <p className="font-display text-3xl tabular-nums">{subTiles.activeSubscriptions}</p>
            <Link className="mt-1 inline-block text-sm text-primary underline underline-offset-4" href="/admin/subscriptions">{t('subscriptionManage')}</Link>
          </CardContent>
        </Card>
      </div>

      <Card className="border-dashed">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-medium text-muted-foreground">{t('subscriptionNextDelivery')}</CardTitle>
          <Badge variant="outline">{subTiles.deliveriesThisWeek} this week</Badge>
        </CardHeader>
        <CardContent><p className="font-display text-3xl tabular-nums">{subTiles.deliveriesThisWeek}</p></CardContent>
      </Card>

      <div>
        <h2 className="mb-4 font-display text-xl font-semibold tracking-tight">{t('fulfillmentPipeline')}</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {pipelineEntries.map(([status, count]) => (
            <Card key={status} className="bg-card">
              <CardHeader className="flex flex-row items-center justify-between gap-3 pb-2">
                <CardTitle className="text-sm font-medium">{fulfillmentLabel(status, t)}</CardTitle>
                <Badge variant={fulfillmentBadgeVariant(status)} className="tabular-nums">{count}</Badge>
              </CardHeader>
              <CardContent>
                <Progress value={(count / maxPipeline) * 100} className="h-2" aria-label={`${fulfillmentLabel(status, t)} ${count}`} />
                <p className="mt-2 text-xs text-muted-foreground tabular-nums">{count} / {maxPipeline} max</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <div>
        <h2 className="mb-4 font-display text-xl font-semibold tracking-tight">{t('lowStockTitle', { count: LOW_STOCK_THRESHOLD })}</h2>
        {stats.lowStock.length === 0 ? (
          <StatusMessage title={t('nothingLow')} />
        ) : (
          <Card className="overflow-hidden p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[14rem]">{t('products')}</TableHead>
                    <TableHead className="w-[10rem]">{t('available')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stats.lowStock.map((row) => (
                    <TableRow key={row.variantId}>
                      <TableCell className="whitespace-normal break-words">
                        <strong className="font-medium">{row.name}</strong>
                      </TableCell>
                      <TableCell>
                        <LowStockBadge available={row.available} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>
        )}
        <div className="mt-4">
          <Link className="text-sm font-medium text-primary underline underline-offset-4" href="/admin/inventory">{t('openInventory')}</Link>
        </div>
      </div>
    </div>
  );
}
