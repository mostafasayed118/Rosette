import { isStuckRow } from '@/features/notifications/notification-retry';

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

type DeliveryRow = { id: string; order_id: string; type: string; recipient: string; locale: string; status: string; attempts: number; last_error: string | null; created_at: string };
type OrderRow = { id: string; display_number: string };

export async function listStuckDeliveries(client: AdminClient, deps: { now?: () => Date } = {}): Promise<StuckDelivery[]> {
  const now = deps.now ?? (() => new Date());
  const { data } = await client.from('notification_deliveries').select('id,order_id,type,recipient,locale,status,attempts,last_error,created_at').in('status', ['failed', 'pending']);
  const rows = (data ?? []) as DeliveryRow[];
  const stuck = rows.filter((r) => isStuckRow({ status: r.status, attempts: r.attempts, created_at: r.created_at }, now()));

  const orderIds = [...new Set(stuck.map((r) => r.order_id))];
  const { data: orders } = orderIds.length ? await client.from('orders').select('id,display_number').in('id', orderIds) : { data: [] };
  const orderMap = new Map<string, string>(((orders ?? []) as OrderRow[]).map((o) => [o.id, o.display_number]));

  return stuck.map((r) => ({
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
}
