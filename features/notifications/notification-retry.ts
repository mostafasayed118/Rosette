import { sendOrderNotification } from './notification-service';
import type { EmailLocale, NotificationType } from './email-types';

export const MAX_ATTEMPTS = 3;
export const STALE_PENDING_MS = 15 * 60 * 1000;

const NOTIFICATION_TYPES = new Set<NotificationType>([
  'order_received', 'payment_confirmed', 'payment_failed', 'preparing', 'ready_for_delivery', 'out_for_delivery', 'delivered',
]);

type RetryClient = { from: (table: string) => any };
export type RetrySummary = { retried: number; sent: number; failed: number; skipped: number };

type DeliveryRow = { id: string; order_id: string; type: string; recipient: string; locale: string; attempts: number; status: string; created_at: string };
type OrderRow = { display_number: string; total_minor: number; public_token: string | null };

export async function retryStuckNotifications(
  client: RetryClient,
  deps: { sendNotification?: typeof sendOrderNotification; now?: () => Date; orderUrlBase?: string } = {},
): Promise<RetrySummary> {
  const send = deps.sendNotification ?? sendOrderNotification;
  const now = deps.now ?? (() => new Date());
  const base = (deps.orderUrlBase ?? '').replace(/\/$/, '');
  const summary: RetrySummary = { retried: 0, sent: 0, failed: 0, skipped: 0 };

  const { data } = await client.from('notification_deliveries').select('id,order_id,type,recipient,locale,attempts,status,created_at').in('status', ['failed', 'pending']);
  const rows = (data ?? []) as DeliveryRow[];
  const staleCutoff = new Date(now().getTime() - STALE_PENDING_MS).toISOString();

  const candidates = rows.filter((row) => {
    if (row.status === 'failed') return row.attempts < MAX_ATTEMPTS;
    if (row.status === 'pending') return row.created_at <= staleCutoff;
    return false;
  });
  summary.skipped += rows.length - candidates.length;

  for (const row of candidates) {
    if (!NOTIFICATION_TYPES.has(row.type as NotificationType)) {
      summary.skipped += 1;
      await client.from('notification_deliveries').update({ status: 'failed', last_error: 'unknown_type' }).eq('id', row.id);
      continue;
    }
    const { data: order } = await client.from('orders').select('display_number,total_minor,public_token').eq('id', row.order_id).maybeSingle();
    if (!order) {
      summary.skipped += 1;
      await client.from('notification_deliveries').update({ status: 'failed', last_error: 'order_missing' }).eq('id', row.id);
      continue;
    }
    const orderRow = order as OrderRow;
    const result = await send({
      locale: row.locale as EmailLocale,
      type: row.type as NotificationType,
      orderNumber: orderRow.display_number,
      totalMinor: orderRow.total_minor,
      recipientEmail: row.recipient,
      orderUrl: `${base}/orders/${row.order_id}?token=${encodeURIComponent(orderRow.public_token ?? '')}`,
    });
    summary.retried += 1;
    if (result.accepted) {
      summary.sent += 1;
      await client.from('notification_deliveries').update({ status: 'sent', sent_at: now().toISOString(), attempts: row.attempts + 1, last_error: null }).eq('id', row.id);
    } else {
      summary.failed += 1;
      await client.from('notification_deliveries').update({ status: 'failed', attempts: row.attempts + 1, last_error: 'smtp_failed' }).eq('id', row.id);
    }
  }
  return summary;
}
