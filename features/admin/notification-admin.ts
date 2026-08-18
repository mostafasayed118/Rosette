import { isStuckRow, NOTIFICATION_TYPES } from '@/features/notifications/notification-retry';
import type { NotificationType } from '@/features/notifications/email-types';

type AdminClient = { from: (table: string) => any };

export type StuckDelivery = {
  id: string;
  type: string;
  recipient: string;
  locale: string;
  status: 'pending' | 'failed';
  attempts: number;
  lastError: string | null;
  createdAt: string;
  orderNumber: string | null;
};

export type StuckDeliveryPage = { rows: StuckDelivery[]; total: number };

export type StuckDeliveryQuery = {
  q?: string;
  status?: string;
  type?: string;
  page?: number;
  pageSize?: number;
};

type DeliveryRow = { id: string; order_id: string; type: string; recipient: string; locale: string; status: string; attempts: number; last_error: string | null; created_at: string };
type OrderRow = { id: string; display_number: string };

export async function listStuckDeliveries(client: AdminClient, deps: { now?: () => Date } & StuckDeliveryQuery = {}): Promise<StuckDeliveryPage> {
  const now = deps.now ?? (() => new Date());
  const q = deps.q?.trim().toLowerCase();
  const status = deps.status === 'failed' || deps.status === 'pending' ? deps.status : undefined;
  const type = deps.type && NOTIFICATION_TYPES.has(deps.type as NotificationType) ? deps.type : undefined;
  const page = Math.max(1, Math.floor(deps.page ?? 1));
  const pageSize = deps.pageSize ?? 10;

  const { data } = await client.from('notification_deliveries').select('id,order_id,type,recipient,locale,status,attempts,last_error,created_at').in('status', ['failed', 'pending']);
  const rows = (data ?? []) as DeliveryRow[];
  const stuck = rows.filter((r) => isStuckRow({ status: r.status, attempts: r.attempts, created_at: r.created_at }, now()));

  const orderIds = [...new Set(stuck.map((r) => r.order_id))];
  const { data: orders } = orderIds.length ? await client.from('orders').select('id,display_number').in('id', orderIds) : { data: [] };
  const orderMap = new Map<string, string>(((orders ?? []) as OrderRow[]).map((o) => [o.id, o.display_number]));

  let list: StuckDelivery[] = stuck.map((r) => ({
    id: r.id,
    type: r.type,
    recipient: r.recipient,
    locale: r.locale,
    status: r.status as 'pending' | 'failed',
    attempts: r.attempts,
    lastError: r.last_error,
    createdAt: r.created_at,
    orderNumber: orderMap.get(r.order_id) ?? null,
  }));

  if (q) {
    list = list.filter((d) => (d.orderNumber ?? '').toLowerCase().includes(q) || d.recipient.toLowerCase().includes(q));
  }
  if (status) list = list.filter((d) => d.status === status);
  if (type) list = list.filter((d) => d.type === type);

  list.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));

  const total = list.length;
  const start = (page - 1) * pageSize;
  return { rows: list.slice(start, start + pageSize), total };
}
