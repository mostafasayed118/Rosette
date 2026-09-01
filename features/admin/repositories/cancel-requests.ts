import { getAdminClient, type AdminClient } from './client';
import { ADMIN_ORDER_SUMMARY_SELECT } from './order-select';
import { mapReviewerNames } from './profiles';

export type CancelRequestOrder = {
  id: string;
  displayNumber: string;
  customerEmail: string;
  totalMinor: number;
  paymentStatus: string;
  fulfillmentStatus: string;
};

export type CancelRequestRow = {
  id: string;
  status: 'pending' | 'approved' | 'rejected';
  reason: string | null;
  createdAt: string;
  reviewedAt: string | null;
  reviewedByName: string | null;
  order: CancelRequestOrder | null;
};

type RawRow = {
  id: string;
  status: string;
  reason: string | null;
  created_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  orders?: Record<string, unknown> | null;
};

const REQUEST_FIELDS = 'id,status,reason,created_at,reviewed_at,reviewed_by';

function mapRow(row: RawRow, reviewerNames: Map<string, string>): CancelRequestRow {
  const order = row.orders ?? null;
  return {
    id: String(row.id),
    status: row.status === 'pending' ? 'pending' : row.status === 'rejected' ? 'rejected' : 'approved',
    reason: row.reason ? String(row.reason) : null,
    createdAt: String(row.created_at),
    reviewedAt: row.reviewed_at ? String(row.reviewed_at) : null,
    reviewedByName: row.reviewed_by ? reviewerNames.get(String(row.reviewed_by)) ?? null : null,
    order: order
      ? {
          id: String(order.id ?? ''),
          displayNumber: String(order.display_number ?? ''),
          customerEmail: String(order.customer_email ?? ''),
          totalMinor: Number(order.total_minor ?? 0),
          paymentStatus: String(order.payment_status ?? ''),
          fulfillmentStatus: String(order.fulfillment_status ?? ''),
        }
      : null,
  };
}

export type CancelRequestQueues = { pending: CancelRequestRow[]; resolved: CancelRequestRow[] };

export async function listCancelRequests(client: AdminClient = getAdminClient()): Promise<CancelRequestQueues> {
  const select = `${REQUEST_FIELDS},orders(${ADMIN_ORDER_SUMMARY_SELECT})`;
  const [{ data: pendingRows }, { data: resolvedRows }] = await Promise.all([
    client.from('order_cancel_requests').select(select).eq('status', 'pending').order('created_at', { ascending: false }).limit(100),
    client.from('order_cancel_requests').select(select).in('status', ['approved', 'rejected']).order('reviewed_at', { ascending: false }).limit(100),
  ]);

  const pending = (pendingRows ?? []) as unknown as RawRow[];
  const resolved = (resolvedRows ?? []) as unknown as RawRow[];
  const reviewerNames = await mapReviewerNames(
    [...pending, ...resolved].map((row) => row?.reviewed_by),
    client,
  );

  return {
    pending: pending.map((row) => mapRow(row, reviewerNames)),
    resolved: resolved.map((row) => mapRow(row, reviewerNames)),
  };
}
