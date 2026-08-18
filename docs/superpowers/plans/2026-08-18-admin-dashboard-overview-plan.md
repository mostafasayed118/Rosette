# Admin Dashboard Overview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `/admin` from a bare hub into a read-only operations dashboard: awaiting-fulfillment count, revenue today/all-time, a per-status fulfillment pipeline, and an inline low-stock list, each linking into its admin page.

**Architecture:** A pure, testable `computeDashboardStats(orders, inventory, now)` helper in `dashboard-stats.ts`; the `/admin` server page fetches orders + inventory via `getAdminSupabase`, passes rows through the helper, and renders stat cards, pipeline counts, and the low-stock list.

**Tech Stack:** Next.js 16 App Router, TypeScript strict, Supabase (postgrest-js), Vitest, `@/` path alias.

**Spec:** `docs/superpowers/specs/2026-08-18-admin-dashboard-overview-design.md`

## Global Constraints

- TypeScript strict; `npm run lint` runs `tsc --noEmit` and must pass.
- Vitest for tests; new tests live in `tests/domain/*.test.ts`; `@/` resolves to repo root.
- Money is in minor units (piasters); the dashboard shows EGP (minor ÷ 100, `.toFixed(2)`), matching existing admin pages.
- Admin UI is English-only.
- Read-only: no new tables, no migrations, no API routes, no customer-facing changes.
- Low stock threshold = 3 (available = `quantity − reserved_quantity`), list capped at 10 entries, sorted ascending.
- `PaymentStatus`/`FulfillmentStatus` types come from `@/features/commerce/order-state`.
- No secrets in code or tests; tests use fakes only, never live services.
- TDD: failing test → run (red) → implement → run (green) → commit.
- All 107 existing tests stay passing.

---

### Task 1: `computeDashboardStats` aggregation helper

**Files:**
- Create: `features/admin/dashboard-stats.ts`
- Test: `tests/domain/dashboard-stats.test.ts`

**Interfaces:**
- Consumes: `PaymentStatus`, `FulfillmentStatus` from `@/features/commerce/order-state`.
- Produces:
  - `export const LOW_STOCK_THRESHOLD = 3`
  - `export type OrderRow = { payment_status: PaymentStatus; fulfillment_status: FulfillmentStatus; total_minor: number; created_at: string }`
  - `export type InventoryRow = { variant_name_en: string; quantity: number; reserved_quantity: number }`
  - `export type PipelineStatus = 'confirmed' | 'preparing' | 'ready_for_delivery' | 'out_for_delivery' | 'delivered'`
  - `export type DashboardStats = { awaitingFulfillment: number; revenueTodayMinor: number; revenueAllTimeMinor: number; pipeline: Record<PipelineStatus, number>; lowStock: Array<{ name: string; available: number }> }`
  - `computeDashboardStats(orders: OrderRow[], inventory: InventoryRow[], now: Date = new Date()): DashboardStats`

- [ ] **Step 1: Write the failing test**

`tests/domain/dashboard-stats.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { computeDashboardStats, LOW_STOCK_THRESHOLD, type InventoryRow, type OrderRow } from '@/features/admin/dashboard-stats';

const today = new Date(2026, 7, 18, 12, 0, 0); // Aug 18, 2026 12:00 local
const todayStr = today.toISOString();
const yesterdayStr = new Date(2026, 7, 17, 12, 0, 0).toISOString();

const order = (over: Partial<OrderRow>): OrderRow => ({ payment_status: 'paid', fulfillment_status: 'confirmed', total_minor: 10000, created_at: todayStr, ...over });

const emptyPipeline = { confirmed: 0, preparing: 0, ready_for_delivery: 0, out_for_delivery: 0, delivered: 0 };

describe('computeDashboardStats', () => {
  it('counts awaiting fulfillment as paid, non-delivered, non-cancelled', () => {
    const stats = computeDashboardStats([
      order({ fulfillment_status: 'confirmed' }),
      order({ fulfillment_status: 'preparing' }),
      order({ fulfillment_status: 'delivered' }),
      order({ fulfillment_status: 'cancelled' }),
      order({ payment_status: 'pending', fulfillment_status: 'confirmed' }),
    ], [], today);
    expect(stats.awaitingFulfillment).toBe(2);
  });

  it('sums revenue today from paid orders on the same local date', () => {
    const stats = computeDashboardStats([
      order({ total_minor: 10000 }),
      order({ total_minor: 25000 }),
      order({ total_minor: 5000, created_at: yesterdayStr }),
    ], [], today);
    expect(stats.revenueTodayMinor).toBe(35000);
  });

  it('sums revenue all-time from paid orders only', () => {
    const stats = computeDashboardStats([
      order({ total_minor: 10000 }),
      order({ total_minor: 25000, created_at: yesterdayStr }),
      order({ payment_status: 'pending', total_minor: 90000 }),
      order({ payment_status: 'cancelled', total_minor: 80000 }),
    ], [], today);
    expect(stats.revenueAllTimeMinor).toBe(35000);
  });

  it('excludes unpaid orders from revenue today', () => {
    const stats = computeDashboardStats([
      order({ payment_status: 'payment_started', total_minor: 5000 }),
    ], [], today);
    expect(stats.revenueTodayMinor).toBe(0);
  });

  it('counts the pipeline per status for paid orders, excluding cancelled', () => {
    const stats = computeDashboardStats([
      order({ fulfillment_status: 'confirmed' }),
      order({ fulfillment_status: 'preparing' }),
      order({ fulfillment_status: 'ready_for_delivery' }),
      order({ fulfillment_status: 'out_for_delivery' }),
      order({ fulfillment_status: 'delivered' }),
      order({ fulfillment_status: 'cancelled' }),
      order({ payment_status: 'pending', fulfillment_status: 'confirmed' }),
    ], [], today);
    expect(stats.pipeline).toEqual({ confirmed: 1, preparing: 1, ready_for_delivery: 1, out_for_delivery: 1, delivered: 1 });
  });

  it('lists low stock with available ≤ threshold and carries names', () => {
    const inventory: InventoryRow[] = [
      { variant_name_en: 'Classic', quantity: 5, reserved_quantity: 3 },
      { variant_name_en: 'Deluxe', quantity: 10, reserved_quantity: 0 },
      { variant_name_en: 'Bare', quantity: 0, reserved_quantity: 0 },
    ];
    const stats = computeDashboardStats([], inventory, today);
    expect(stats.lowStock).toEqual([
      { name: 'Bare', available: 0 },
      { name: 'Classic', available: 2 },
    ]);
  });

  it('sorts low stock ascending and caps the list at 10', () => {
    const inventory: InventoryRow[] = Array.from({ length: 15 }, (_, i) => ({ variant_name_en: `V${i}`, quantity: i % 5, reserved_quantity: 0 }));
    const stats = computeDashboardStats([], inventory, today);
    expect(stats.lowStock).toHaveLength(10);
    const available = stats.lowStock.map((row) => row.available);
    expect(available).toEqual([...available].sort((a, b) => a - b));
    expect(stats.lowStock[0]!.available).toBe(0);
    expect(stats.lowStock[9]!.available).toBe(LOW_STOCK_THRESHOLD);
  });

  it('returns zeroed stats for empty inputs', () => {
    expect(computeDashboardStats([], [], today)).toEqual({ awaitingFulfillment: 0, revenueTodayMinor: 0, revenueAllTimeMinor: 0, pipeline: emptyPipeline, lowStock: [] });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/domain/dashboard-stats.test.ts`
Expected: FAIL — module `@/features/admin/dashboard-stats` not found.

- [ ] **Step 3: Implement**

`features/admin/dashboard-stats.ts`:

```ts
import type { FulfillmentStatus, PaymentStatus } from '@/features/commerce/order-state';

export const LOW_STOCK_THRESHOLD = 3;
const LOW_STOCK_LIMIT = 10;

export type OrderRow = { payment_status: PaymentStatus; fulfillment_status: FulfillmentStatus; total_minor: number; created_at: string };
export type InventoryRow = { variant_name_en: string; quantity: number; reserved_quantity: number };

const PIPELINE_STATUSES = ['confirmed', 'preparing', 'ready_for_delivery', 'out_for_delivery', 'delivered'] as const;
export type PipelineStatus = (typeof PIPELINE_STATUSES)[number];

export type DashboardStats = {
  awaitingFulfillment: number;
  revenueTodayMinor: number;
  revenueAllTimeMinor: number;
  pipeline: Record<PipelineStatus, number>;
  lowStock: Array<{ name: string; available: number }>;
};

function isPaid(order: OrderRow): boolean {
  return order.payment_status === 'paid';
}

function isAwaitingFulfillment(order: OrderRow): boolean {
  return order.fulfillment_status !== 'delivered' && order.fulfillment_status !== 'cancelled';
}

function sameLocalDate(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function computeDashboardStats(orders: OrderRow[], inventory: InventoryRow[], now: Date = new Date()): DashboardStats {
  const paid = orders.filter(isPaid);
  const awaitingFulfillment = paid.filter(isAwaitingFulfillment).length;
  const revenueTodayMinor = paid
    .filter((orderRow) => sameLocalDate(new Date(orderRow.created_at), now))
    .reduce((sum, orderRow) => sum + orderRow.total_minor, 0);
  const revenueAllTimeMinor = paid.reduce((sum, orderRow) => sum + orderRow.total_minor, 0);
  const pipeline = Object.fromEntries(
    PIPELINE_STATUSES.map((status: PipelineStatus) => [status, paid.filter((orderRow) => orderRow.fulfillment_status === status).length]),
  ) as Record<PipelineStatus, number>;
  const lowStock = inventory
    .map((row) => ({ name: row.variant_name_en, available: row.quantity - row.reserved_quantity }))
    .filter((row) => row.available <= LOW_STOCK_THRESHOLD)
    .sort((a, b) => a.available - b.available)
    .slice(0, LOW_STOCK_LIMIT);
  return { awaitingFulfillment, revenueTodayMinor, revenueAllTimeMinor, pipeline, lowStock };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/domain/dashboard-stats.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Run the full suite, then commit**

Run: `npm test`
Expected: 107 existing + 8 new = **115 passed**.

```bash
git add features/admin/dashboard-stats.ts tests/domain/dashboard-stats.test.ts
git commit -m "feat: add admin dashboard stats aggregation helper"
```

---

### Task 2: Dashboard page

**Files:**
- Modify: `app/admin/page.tsx` (full rewrite — replace the bare hub with the stats dashboard)

**Interfaces:**
- Consumes: `computeDashboardStats`, `LOW_STOCK_THRESHOLD`, `OrderRow`, `InventoryRow` (Task 1); `getCurrentAdmin` from `@/features/auth/server`; `getAdminSupabase` from `@/lib/supabase/admin`; `signOut` from `@/features/auth/actions`.
- Produces: the `/admin` page — stat cards, pipeline counts, low-stock list, existing nav + sign-out preserved. Pipeline status slugs link to `/admin/orders?fulfillment=<status>` (the orders list already supports that filter).

- [ ] **Step 1: Rewrite the page**

Replace the entire contents of `app/admin/page.tsx` with:

```tsx
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
```

- [ ] **Step 2: Verify typecheck and build**

Run: `npm run lint && npm run build`
Expected: both pass; `/admin` appears in the build output.

- [ ] **Step 3: Commit**

```bash
git add app/admin/page.tsx
git commit -m "feat: add admin dashboard overview with stats, pipeline, and low stock"
```

---

### Task 3: Final verification

- [ ] **Step 1: Run the full gate**

Run: `npm test && npm run lint && npm run build && git diff --check`
Expected: all tests pass (107 existing + 8 new = **115**), tsc clean, build succeeds, no whitespace errors.

- [ ] **Step 2: Secret scan**

Run: `npm test -- tests/security/no-secrets.test.ts`
Expected: PASS — the repository secret scan covers all `ts/tsx/js/mjs/json/md/env/sql/css` files.

- [ ] **Step 3: Commit any stragglers**

```bash
git status --short
git add -A
git commit -m "chore: final admin dashboard overview verification" || echo "nothing to commit"
```
