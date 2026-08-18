import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ClipboardList, TrendingUp, Wallet } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AdminShell } from '@/components/admin/AdminShell';
import { computeDashboardStats, LOW_STOCK_THRESHOLD, type InventoryRow, type OrderRow } from '@/features/admin/dashboard-stats';
import { getCurrentAdmin } from '@/features/auth/server';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { getServerT } from '@/features/i18n/server';

const egp = (minor: number) => `${(minor / 100).toFixed(2)} EGP`;

type InventoryRowWithVariant = { variant_id: string; quantity: number; reserved_quantity: number; product_variants?: { name_en: string } | null };

export default async function AdminPage() {
  const admin = await getCurrentAdmin();
  if (!admin) redirect('/login');
  const { t } = await getServerT();
  const [ordersResult, inventoryResult] = await Promise.all([
    getAdminSupabase().from('orders').select('payment_status,fulfillment_status,total_minor,created_at'),
    getAdminSupabase().from('inventory').select('variant_id,quantity,reserved_quantity,product_variants(name_en)'),
  ]);
  const stats = computeDashboardStats(
    (ordersResult.data ?? []) as OrderRow[],
    // PostgREST embeds the PK-backed to-one `product_variants` as an object, not an array.
    ((inventoryResult.data ?? []) as unknown as InventoryRowWithVariant[]).map((row): InventoryRow => ({
      variant_id: row.variant_id,
      variant_name_en: row.product_variants?.name_en ?? t('unknownVariant'),
      quantity: row.quantity,
      reserved_quantity: row.reserved_quantity,
    })),
  );
  const pipelineEntries = Object.entries(stats.pipeline) as Array<[string, number]>;
  const maxPipeline = Math.max(1, ...pipelineEntries.map(([, count]) => count));
  return <AdminShell>
    <p className="eyebrow">{t('adminEyebrow')}</p>
    <h1 className="font-display text-[clamp(2rem,4vw,3rem)] leading-tight tracking-[-.02em]">{t('adminDashboard')}</h1>
    <p className="text-muted-foreground">{t('signedInAs', { role: admin.role })}</p>
    <div className="mb-8 mt-6 grid grid-cols-[repeat(auto-fit,minmax(14rem,1fr))] gap-4">
      <Card><CardHeader className="flex flex-row items-center justify-between gap-4"><CardTitle className="text-sm font-medium text-muted-foreground">{t('awaitingFulfillment')}</CardTitle><span className="grid h-10 w-10 place-items-center rounded-full bg-accent text-primary"><ClipboardList className="h-5 w-5" /></span></CardHeader><CardContent><p className="font-display text-3xl">{stats.awaitingFulfillment}</p><Link className="text-sm text-primary underline underline-offset-4" href="/admin/orders">{t('openOrders')}</Link></CardContent></Card>
      <Card><CardHeader className="flex flex-row items-center justify-between gap-4"><CardTitle className="text-sm font-medium text-muted-foreground">{t('revenueToday')}</CardTitle><span className="grid h-10 w-10 place-items-center rounded-full bg-accent text-primary"><Wallet className="h-5 w-5" /></span></CardHeader><CardContent><p className="font-display text-3xl">{egp(stats.revenueTodayMinor)}</p></CardContent></Card>
      <Card><CardHeader className="flex flex-row items-center justify-between gap-4"><CardTitle className="text-sm font-medium text-muted-foreground">{t('revenueAllTime')}</CardTitle><span className="grid h-10 w-10 place-items-center rounded-full bg-accent text-primary"><TrendingUp className="h-5 w-5" /></span></CardHeader><CardContent><p className="font-display text-3xl">{egp(stats.revenueAllTimeMinor)}</p></CardContent></Card>
    </div>
    <h2 className="font-display text-2xl">{t('fulfillmentPipeline')}</h2>
    <div className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(14rem,1fr))] gap-4">
      {pipelineEntries.map(([status, count]) => (
        <Card key={status}><CardHeader><CardTitle className="text-sm font-medium">{status}</CardTitle></CardHeader><CardContent><Progress value={(count / maxPipeline) * 100} className="h-2" /><p className="mt-2 text-sm text-muted-foreground">{count}</p></CardContent></Card>
      ))}
    </div>
    <h2 className="mt-8 font-display text-2xl">{t('lowStockTitle', { count: LOW_STOCK_THRESHOLD })}</h2>
    {stats.lowStock.length === 0 ? <p className="mt-4 text-muted-foreground">{t('nothingLow')}</p> : <Card className="mt-4"><Table><TableHeader><TableRow><TableHead>{t('products')}</TableHead><TableHead>{t('available')}</TableHead></TableRow></TableHeader><TableBody>{stats.lowStock.map((row) => <TableRow key={row.variant_id}><TableCell><strong>{row.name}</strong></TableCell><TableCell><Badge variant="secondary">{row.available} {t('available')}</Badge></TableCell></TableRow>)}</TableBody></Table></Card>}
    <p className="mt-6"><Link className="text-sm text-primary underline underline-offset-4" href="/admin/inventory">{t('openInventory')}</Link></p>
  </AdminShell>;
}
