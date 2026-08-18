import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { computeDashboardStats, LOW_STOCK_THRESHOLD, type InventoryRow, type OrderRow } from '@/features/admin/dashboard-stats';
import { getCurrentAdmin } from '@/features/auth/server';
import { signOut } from '@/features/auth/actions';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { getServerT } from '@/features/i18n/server';

const egp = (minor: number) => `${(minor / 100).toFixed(2)} EGP`;

type InventoryRowWithVariant = { quantity: number; reserved_quantity: number; product_variants?: Array<{ name_en: string }> | null };

export default async function AdminPage() {
  const admin = await getCurrentAdmin();
  if (!admin) redirect('/login');
  const { t } = await getServerT();
  const [ordersResult, inventoryResult] = await Promise.all([
    getAdminSupabase().from('orders').select('payment_status,fulfillment_status,total_minor,created_at'),
    getAdminSupabase().from('inventory').select('quantity,reserved_quantity,product_variants(name_en)'),
  ]);
  const stats = computeDashboardStats(
    (ordersResult.data ?? []) as OrderRow[],
    ((inventoryResult.data ?? []) as InventoryRowWithVariant[]).map((row): InventoryRow => ({
      variant_name_en: row.product_variants?.[0]?.name_en ?? t('unknownVariant'),
      quantity: row.quantity,
      reserved_quantity: row.reserved_quantity,
    })),
  );
  const pipelineEntries = Object.entries(stats.pipeline) as Array<[string, number]>;
  return <main className="content-frame">
    <p className="eyebrow">{t('adminEyebrow')}</p>
    <h1>{t('adminDashboard')}</h1>
    <p>{t('signedInAs', { role: admin.role })}</p>
    <div className="admin-table">
      <article className="status-message"><strong>{t('awaitingFulfillment')}</strong><span>{stats.awaitingFulfillment}</span><Link href="/admin/orders">{t('openOrders')}</Link></article>
      <article className="status-message"><strong>{t('revenueToday')}</strong><span>{egp(stats.revenueTodayMinor)}</span></article>
      <article className="status-message"><strong>{t('revenueAllTime')}</strong><span>{egp(stats.revenueAllTimeMinor)}</span></article>
    </div>
    <h2>{t('fulfillmentPipeline')}</h2>
    <div className="admin-table">
      {pipelineEntries.map(([status, count]) => <article className="status-message" key={status}><Link href={`/admin/orders?fulfillment=${status}`}><strong>{status}</strong></Link><span>{count}</span></article>)}
    </div>
    <h2>{t('lowStockTitle', { count: LOW_STOCK_THRESHOLD })}</h2>
    {stats.lowStock.length === 0 ? <p>{t('nothingLow')}</p> : <div className="admin-table">{stats.lowStock.map((row) => <article className="status-message" key={row.name}><strong>{row.name}</strong><span>{row.available} {t('available')}</span></article>)}</div>}
    <p><Link className="button" href="/admin/inventory">{t('openInventory')}</Link></p>
    <nav className="admin-links"><Link className="button" href="/admin/orders">{t('orders')}</Link><Link className="button" href="/admin/products">{t('products')}</Link><Link className="button" href="/admin/inventory">{t('inventory')}</Link><Link className="button" href="/admin/delivery">{t('deliveryRules')}</Link></nav>
    <form action={signOut}><Button type="submit">{t('signOut')}</Button></form>
  </main>;
}
