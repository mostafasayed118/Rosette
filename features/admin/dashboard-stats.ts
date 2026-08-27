import type { FulfillmentStatus, PaymentStatus } from '@/features/commerce/order-state';

export const LOW_STOCK_THRESHOLD = 3;
const LOW_STOCK_LIMIT = 10;

export type OrderRow = { payment_status: PaymentStatus; fulfillment_status: FulfillmentStatus; total_minor: number; created_at: string };
export type InventoryRow = { variant_id: string; variant_name_en: string; quantity: number; reserved_quantity: number };

const PIPELINE_STATUSES = ['confirmed', 'preparing', 'ready_for_delivery', 'out_for_delivery', 'delivered'] as const;
export type PipelineStatus = (typeof PIPELINE_STATUSES)[number];

export type DashboardStats = {
  awaitingFulfillment: number;
  revenueTodayMinor: number;
  revenueAllTimeMinor: number;
  pipeline: Record<PipelineStatus, number>;
  lowStock: Array<{ variant_id: string; name: string; available: number }>;
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
    .map((row) => ({ variant_id: row.variant_id, name: row.variant_name_en, available: row.quantity - row.reserved_quantity }))
    .filter((row) => row.available <= LOW_STOCK_THRESHOLD)
    .sort((a, b) => a.available - b.available)
    .slice(0, LOW_STOCK_LIMIT);
  return { awaitingFulfillment, revenueTodayMinor, revenueAllTimeMinor, pipeline, lowStock };
}

export function computeSubscriptionTiles(
  subscriptions: Array<{ status: string }>,
  deliveries: Array<{ status: string; scheduled_date?: string }>,
  now: Date = new Date(),
): { activeSubscriptions: number; deliveriesThisWeek: number } {
  const activeSubscriptions = subscriptions.filter((s) => s.status === 'active').length;
  const start = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const end = start + 7 * 86_400_000;
  const deliveriesThisWeek = deliveries.filter((d) => {
    const t = new Date(`${d.scheduled_date}T00:00:00Z`).getTime();
    return (d.status === 'scheduled' || d.status === 'ordered') && Number.isFinite(t) && t >= start && t < end;
  }).length;
  return { activeSubscriptions, deliveriesThisWeek };
}
