import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { computeDashboardStats, LOW_STOCK_THRESHOLD, type InventoryRow, type OrderRow } from '@/features/admin/dashboard-stats';
import { getCurrentAdmin } from '@/features/auth/server';
import { signOut } from '@/features/auth/actions';
import { getAdminSupabase } from '@/lib/supabase/admin';

const egp = (minor: number) => `${(minor / 100).toFixed(2)} EGP`;

type InventoryRowWithVariant = { quantity: number; reserved_quantity: number; product_variants?: Array<{ name_en: string }> | null };

export default async function AdminPage() {
  const admin = await getCurrentAdmin();
  if (!admin) redirect('/login');
  const [ordersResult, inventoryResult] = await Promise.all([
    getAdminSupabase().from('orders').select('payment_status,fulfillment_status,total_minor,created_at'),
    getAdminSupabase().from('inventory').select('quantity,reserved_quantity,product_variants(name_en)'),
  ]);
  const stats = computeDashboardStats(
    (ordersResult.data ?? []) as OrderRow[],
    ((inventoryResult.data ?? []) as InventoryRowWithVariant[]).map((row): InventoryRow => ({
      variant_name_en: row.product_variants?.[0]?.name_en ?? 'Unknown variant',
      quantity: row.quantity,
      reserved_quantity: row.reserved_quantity,
    })),
  );
  const pipelineEntries = Object.entries(stats.pipeline) as Array<[string, number]>;
  return <main className="content-frame">
    <p className="eyebrow">Rosette operations</p>
    <h1>Admin dashboard</h1>
    <p>Signed in as {admin.role}.</p>
    <div className="admin-table">
      <article className="status-message"><strong>Awaiting fulfillment</strong><span>{stats.awaitingFulfillment}</span><Link href="/admin/orders">Open orders</Link></article>
      <article className="status-message"><strong>Revenue today</strong><span>{egp(stats.revenueTodayMinor)}</span></article>
      <article className="status-message"><strong>Revenue all-time</strong><span>{egp(stats.revenueAllTimeMinor)}</span></article>
    </div>
    <h2>Fulfillment pipeline</h2>
    <div className="admin-table">
      {pipelineEntries.map(([status, count]) => <article className="status-message" key={status}><Link href={`/admin/orders?fulfillment=${status}`}><strong>{status}</strong></Link><span>{count}</span></article>)}
    </div>
    <h2>Low stock (≤ {LOW_STOCK_THRESHOLD} available)</h2>
    {stats.lowStock.length === 0 ? <p>All good — nothing low.</p> : <div className="admin-table">{stats.lowStock.map((row) => <article className="status-message" key={row.name}><strong>{row.name}</strong><span>{row.available} available</span></article>)}</div>}
    <p><Link className="button" href="/admin/inventory">Open inventory</Link></p>
    <nav className="admin-links"><Link className="button" href="/admin/orders">Orders</Link><Link className="button" href="/admin/products">Products</Link><Link className="button" href="/admin/inventory">Inventory</Link><Link className="button" href="/admin/delivery">Delivery rules</Link></nav>
    <form action={signOut}><Button type="submit">Sign out</Button></form>
  </main>;
}
