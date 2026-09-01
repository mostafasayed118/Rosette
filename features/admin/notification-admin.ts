import { NOTIFICATION_TYPES, resolveRetryLimits } from '@/features/notifications/notification-retry';
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

type RpcRow = {
  id: string;
  type: string;
  recipient: string;
  locale: string;
  status: string;
  attempts: number;
  last_error: string | null;
  created_at: string;
  order_number: string | null;
};

type RpcClient = {
  rpc: (name: string, params: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
};

export async function listStuckDeliveries(client: AdminClient, deps: { now?: () => Date; maxAttempts?: number; stalePendingMs?: number } & StuckDeliveryQuery = {}): Promise<StuckDeliveryPage> {
  const now = deps.now ?? (() => new Date());
  const limits = resolveRetryLimits();
  const maxAttempts = deps.maxAttempts ?? limits.maxAttempts;
  const stalePendingMs = deps.stalePendingMs ?? limits.stalePendingMs;
  const q = deps.q?.trim() || null;
  const status = deps.status === 'failed' || deps.status === 'pending' ? deps.status : null;
  const type = deps.type && NOTIFICATION_TYPES.has(deps.type as NotificationType) ? deps.type : null;
  const page = Math.max(1, Math.floor(deps.page ?? 1));
  const pageSize = deps.pageSize ?? 10;
  const nowIso = now().toISOString();

  const rpcClient = client as unknown as RpcClient;
  const filterParams = {
    p_q: q,
    p_status: status,
    p_type: type,
    p_now: nowIso,
    p_max_attempts: maxAttempts,
    p_stale_pending_ms: stalePendingMs,
  };

  const [{ data }, { data: countData }] = await Promise.all([
    rpcClient.rpc('admin_notification_deliveries', { ...filterParams, p_page_size: pageSize, p_page_offset: (page - 1) * pageSize }),
    rpcClient.rpc('admin_notification_deliveries_count', filterParams),
  ]);

  const rows = ((data ?? []) as RpcRow[]).map((r) => ({
    id: r.id,
    type: r.type,
    recipient: r.recipient,
    locale: r.locale,
    status: r.status as 'pending' | 'failed',
    attempts: r.attempts,
    lastError: r.last_error,
    createdAt: r.created_at,
    orderNumber: r.order_number,
  }));

  const total = typeof countData === 'number' ? countData : rows.length;
  return { rows, total };
}
