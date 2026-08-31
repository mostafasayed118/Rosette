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
import { getCurrentAdmin } from '@/features/auth/server';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { getServerT } from '@/features/i18n/server';
import { formatMoney } from '@/features/money';
import { fulfillmentBadgeVariant, fulfillmentLabel } from '@/features/admin/status-labels';

type DashboardRpcResult = {
  awaitingFulfillment: number;
  revenueTodayMinor: number;
  revenueAllTimeMinor: number;
  pipeline: Record<string, number>;
  lowStock: Array<{ variant_id: string; name: string; available: number }>;
  activeSubscriptions: number;
  deliveriesThisWeek: number;
};

export default async function AdminPage() {
  const admin = await getCurrentAdmin();
  if (!admin) redirect('/login');
  const { t, locale } = await getServerT();
  const { data, error } = await getAdminSupabase().rpc('get_admin_dashboard_stats');
  if (error) throw new Error(`Dashboard stats query failed: ${error.message}`);
  const stats = data as DashboardRpcResult;
  const pipelineEntries = Object.entries(stats.pipeline) as Array<[string, number]>;
  const maxPipeline = Math.max(1, ...pipelineEntries.map(([, count]) => count));
  const subTiles = { activeSubscriptions: stats.activeSubscriptions, deliveriesThisWeek: stats.deliveriesThisWeek };
  return <>
    <PageHeader eyebrow={t('adminEyebrow')} title={t('adminDashboard')} description={t('signedInAs', { role: admin.role })} />
    <div className="mb-8 mt-6 grid grid-cols-[repeat(auto-fit,minmax(14rem,1fr))] gap-4">
      <Card><CardHeader className="flex flex-row items-center justify-between gap-4"><CardTitle className="text-sm font-medium text-muted-foreground">{t('awaitingFulfillment')}</CardTitle><span className="grid h-10 w-10 place-items-center rounded-full bg-accent text-primary"><ClipboardList className="h-5 w-5" /></span></CardHeader><CardContent><p className="font-display text-3xl">{stats.awaitingFulfillment}</p><Link className="text-sm text-primary underline underline-offset-4" href="/admin/orders">{t('openOrders')}</Link></CardContent></Card>
      <Card><CardHeader className="flex flex-row items-center justify-between gap-4"><CardTitle className="text-sm font-medium text-muted-foreground">{t('revenueToday')}</CardTitle><span className="grid h-10 w-10 place-items-center rounded-full bg-accent text-primary"><Wallet className="h-5 w-5" /></span></CardHeader><CardContent><p className="font-display text-3xl">{formatMoney(stats.revenueTodayMinor, locale)}</p></CardContent></Card>
      <Card><CardHeader className="flex flex-row items-center justify-between gap-4"><CardTitle className="text-sm font-medium text-muted-foreground">{t('revenueAllTime')}</CardTitle><span className="grid h-10 w-10 place-items-center rounded-full bg-accent text-primary"><TrendingUp className="h-5 w-5" /></span></CardHeader><CardContent><p className="font-display text-3xl">{formatMoney(stats.revenueAllTimeMinor, locale)}</p></CardContent></Card>
      <Card><CardHeader className="flex flex-row items-center justify-between gap-4"><CardTitle className="text-sm font-medium text-muted-foreground">{t('subscriptionsTitle')}</CardTitle><span className="grid h-10 w-10 place-items-center rounded-full bg-accent text-primary"><PackageCheck className="h-5 w-5" /></span></CardHeader><CardContent><p className="font-display text-3xl">{subTiles.activeSubscriptions}</p><Link className="text-sm text-primary underline underline-offset-4" href="/admin/subscriptions">{t('subscriptionManage')}</Link></CardContent></Card>
      <Card><CardHeader className="flex flex-row items-center justify-between gap-4"><CardTitle className="text-sm font-medium text-muted-foreground">{t('subscriptionNextDelivery')}</CardTitle><span className="grid h-10 w-10 place-items-center rounded-full bg-accent text-primary"><ClipboardList className="h-5 w-5" /></span></CardHeader><CardContent><p className="font-display text-3xl">{subTiles.deliveriesThisWeek}</p></CardContent></Card>
    </div>
    <h2 className="font-display text-2xl">{t('fulfillmentPipeline')}</h2>
    <div className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(14rem,1fr))] gap-4">
      {pipelineEntries.map(([status, count]) => (
        <Card key={status}><CardHeader className="flex flex-row items-center justify-between gap-3"><CardTitle className="text-sm font-medium">{fulfillmentLabel(status, t)}</CardTitle><Badge variant={fulfillmentBadgeVariant(status)}>{count}</Badge></CardHeader><CardContent><Progress value={(count / maxPipeline) * 100} className="h-2" /></CardContent></Card>
      ))}
    </div>
    <h2 className="mt-8 font-display text-2xl">{t('lowStockTitle', { count: LOW_STOCK_THRESHOLD })}</h2>
    {stats.lowStock.length === 0 ? <StatusMessage title={t('nothingLow')} /> : <Card className="mt-4"><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>{t('products')}</TableHead><TableHead>{t('available')}</TableHead></TableRow></TableHeader><TableBody>{stats.lowStock.map((row) => <TableRow key={row.variant_id}><TableCell><strong>{row.name}</strong></TableCell><TableCell><Badge variant="secondary">{row.available} {t('available')}</Badge></TableCell></TableRow>)}</TableBody></Table></div></Card>}
    <p className="mt-6"><Link className="text-sm text-primary underline underline-offset-4" href="/admin/inventory">{t('openInventory')}</Link></p>
  </>;
}
