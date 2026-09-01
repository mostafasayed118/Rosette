import { applyChanges, parseChangeRequestDiff, type ChangeRequestDiff } from '@/features/order-mutations/change-request';
import { getAdminClient, type AdminClient } from './client';
import { ADMIN_ORDER_SELECT, ADMIN_ORDER_SELECT_WITH_ITEMS } from './order-select';
import { mapReviewerNames } from './profiles';

export type ChangeRequestOrder = {
  id: string;
  displayNumber: string;
  customerEmail: string;
  paymentStatus: string;
  fulfillmentStatus: string;
};

export type ChangeRequestOrderItem = {
  id: string;
  unitPriceMinor: number;
  quantity: number;
  giftMessage: string;
  productName: string;
};

/**
 * Result of re-pricing the order with the requested diff applied.
 *
 * This is computed here — at fetch time — instead of inside the page's render
 * path, so the money arithmetic lives with the rest of the data access (R-16).
 */
export type ChangeRequestPricing = {
  currentTotalMinor: number;
  projectedTotalMinor: number;
  deltaMinor: number;
};

export type ChangeRequestRow = {
  id: string;
  status: 'pending' | 'approved' | 'applied' | 'rejected';
  reason: string | null;
  /** Delta stored on the request row by the customer-facing flow. */
  deltaMinor: number | null;
  createdAt: string;
  reviewedAt: string | null;
  reviewedByName: string | null;
  awaitingPayment: boolean;
  order: ChangeRequestOrder | null;
  orderItems: ChangeRequestOrderItem[];
  /** Parsed diff, or `null` when the stored payload is malformed. */
  diff: ChangeRequestDiff | null;
  pricing: ChangeRequestPricing | null;
};

const ACTIVE_STATUSES = ['pending', 'approved'];
const RESOLVED_STATUSES = ['applied', 'rejected'];
const REQUEST_FIELDS = 'id,status,reason,changes,delta_minor,created_at,reviewed_at,reviewed_by';

type RawRequestRow = {
  id: string;
  status: string;
  reason: string | null;
  changes: unknown;
  delta_minor: number | null;
  created_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  orders?: Record<string, unknown> | null;
};

function toOrder(value: Record<string, unknown> | null | undefined): ChangeRequestOrder | null {
  if (!value) return null;
  return {
    id: String(value.id ?? ''),
    displayNumber: String(value.display_number ?? ''),
    customerEmail: String(value.customer_email ?? ''),
    paymentStatus: String(value.payment_status ?? ''),
    fulfillmentStatus: String(value.fulfillment_status ?? ''),
  };
}

function toItems(value: unknown): ChangeRequestOrderItem[] {
  if (!Array.isArray(value)) return [];
  return (value as Array<Record<string, unknown>>).map((item) => ({
    id: String(item.id ?? ''),
    unitPriceMinor: Number(item.unit_price_minor ?? 0),
    quantity: Number(item.quantity ?? 0),
    giftMessage: String(item.gift_message ?? ''),
    productName: String(item.product_name_en ?? ''),
  }));
}

/**
 * Re-price the order with the diff applied. Returns `null` when the diff is
 * malformed, references an unknown line item, or the order projection is
 * incomplete — the page then simply renders the stored delta instead.
 */
export function priceChangeRequest(
  order: Record<string, unknown> | null | undefined,
  items: ChangeRequestOrderItem[],
  diff: ChangeRequestDiff,
): ChangeRequestPricing | null {
  if (!order) return null;
  const computed = applyChanges(
    {
      subtotal_minor: Number(order.subtotal_minor ?? 0),
      delivery_fee_minor: Number(order.delivery_fee_minor ?? 0),
      discount_minor: order.discount_minor != null ? Number(order.discount_minor) : null,
      total_minor: Number(order.total_minor ?? 0),
    },
    items.map((item) => ({ id: item.id, unit_price_minor: item.unitPriceMinor, quantity: item.quantity, gift_message: item.giftMessage })),
    diff,
  );
  if (!computed.ok) return null;
  return {
    currentTotalMinor: Number(order.total_minor ?? 0),
    projectedTotalMinor: computed.totalMinor,
    deltaMinor: computed.deltaMinor,
  };
}

function mapRow(row: RawRequestRow, reviewerNames: Map<string, string>): ChangeRequestRow {
  const order = row.orders ?? null;
  const orderItems = toItems(order?.order_items);
  const parsed = parseChangeRequestDiff(row.changes);
  const diff = parsed.ok ? parsed.diff : null;
  return {
    id: String(row.id),
    status: row.status as ChangeRequestRow['status'],
    reason: row.reason ? String(row.reason) : null,
    deltaMinor: row.delta_minor != null ? Number(row.delta_minor) : null,
    createdAt: String(row.created_at),
    reviewedAt: row.reviewed_at ? String(row.reviewed_at) : null,
    reviewedByName: row.reviewed_by ? reviewerNames.get(String(row.reviewed_by)) ?? null : null,
    awaitingPayment: row.status === 'approved',
    order: toOrder(order),
    orderItems,
    diff,
    pricing: diff ? priceChangeRequest(order, orderItems, diff) : null,
  };
}

export type ChangeRequestQueues = { active: ChangeRequestRow[]; resolved: ChangeRequestRow[] };

/**
 * Both queues are fetched bounded (100 rows each) with filtering and ordering
 * pushed into Postgres, matching the notification/admin RPC convention.
 */
export async function listChangeRequests(client: AdminClient = getAdminClient()): Promise<ChangeRequestQueues> {
  const [{ data: activeRows }, { data: resolvedRows }] = await Promise.all([
    client
      .from('order_change_requests')
      .select(`${REQUEST_FIELDS},orders(${ADMIN_ORDER_SELECT_WITH_ITEMS})`)
      .in('status', ACTIVE_STATUSES)
      .order('created_at', { ascending: false })
      .limit(100),
    client
      .from('order_change_requests')
      .select(`${REQUEST_FIELDS},orders(${ADMIN_ORDER_SELECT})`)
      .in('status', RESOLVED_STATUSES)
      .order('reviewed_at', { ascending: false })
      .limit(100),
  ]);

  const active = (activeRows ?? []) as unknown as RawRequestRow[];
  const resolved = (resolvedRows ?? []) as unknown as RawRequestRow[];
  const reviewerNames = await mapReviewerNames(
    [...active, ...resolved].map((row) => row?.reviewed_by),
    client,
  );

  return {
    active: active.map((row) => mapRow(row, reviewerNames)),
    resolved: resolved.map((row) => mapRow(row, reviewerNames)),
  };
}
