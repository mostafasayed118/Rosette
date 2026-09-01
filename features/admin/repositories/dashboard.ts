import { getAdminClient, type AdminClient } from './client';

export type DashboardStats = {
  awaitingFulfillment: number;
  revenueTodayMinor: number;
  revenueAllTimeMinor: number;
  pipeline: Record<string, number>;
  lowStock: Array<{ variantId: string; name: string; available: number }>;
  activeSubscriptions: number;
  deliveriesThisWeek: number;
};

type DashboardRpcRow = {
  awaitingFulfillment?: unknown;
  revenueTodayMinor?: unknown;
  revenueAllTimeMinor?: unknown;
  pipeline?: unknown;
  lowStock?: unknown;
  activeSubscriptions?: unknown;
  deliveriesThisWeek?: unknown;
};

function toNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function requireNumber(value: unknown, field: string): number {
  if (value == null) throw new Error(`Dashboard RPC missing required field: ${field}`);
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`Dashboard RPC invalid number for ${field}: ${String(value)}`);
  return parsed;
}

/**
 * Single bounded RPC (`get_admin_dashboard_stats`) — aggregation stays in
 * Postgres rather than being re-implemented in JS.
 */
export async function getDashboardStats(client: AdminClient = getAdminClient()): Promise<DashboardStats> {
  const { data, error } = await client.rpc('get_admin_dashboard_stats');
  if (error) throw new Error(`Dashboard stats query failed: ${error.message}`);
  const row = (data ?? {}) as DashboardRpcRow;
  const pipeline: Record<string, number> = {};
  if (row.pipeline && typeof row.pipeline === 'object') {
    for (const [status, count] of Object.entries(row.pipeline as Record<string, unknown>)) pipeline[status] = toNumber(count);
  }
  // Required aggregates must be present; pipeline/lowStock may be empty but not missing.
  if (row.lowStock != null && !Array.isArray(row.lowStock)) throw new Error('Dashboard RPC invalid lowStock: expected array');
  if (row.pipeline != null && typeof row.pipeline !== 'object') throw new Error('Dashboard RPC invalid pipeline: expected object');

  return {
    awaitingFulfillment: requireNumber(row.awaitingFulfillment, 'awaitingFulfillment'),
    revenueTodayMinor: requireNumber(row.revenueTodayMinor, 'revenueTodayMinor'),
    revenueAllTimeMinor: requireNumber(row.revenueAllTimeMinor, 'revenueAllTimeMinor'),
    pipeline,
    lowStock: Array.isArray(row.lowStock)
      ? (row.lowStock as Array<Record<string, unknown>>).map((entry) => ({
          variantId: String(entry.variant_id ?? ''),
          name: String(entry.name ?? ''),
          available: toNumber(entry.available),
        }))
      : [],
    activeSubscriptions: requireNumber(row.activeSubscriptions, 'activeSubscriptions'),
    deliveriesThisWeek: requireNumber(row.deliveriesThisWeek, 'deliveriesThisWeek'),
  };
}
