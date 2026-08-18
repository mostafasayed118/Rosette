import { describe, expect, it } from 'vitest';
import { MAX_ATTEMPTS, resolveRetryLimits, retryStuckNotifications, STALE_PENDING_MS } from '@/features/notifications/notification-retry';

type DeliveryRow = { id: string; order_id: string; type: string; recipient: string; locale: string; attempts: number; status: string; created_at: string };
type OrderRow = { display_number: string; total_minor: number; public_token: string | null };
type Call = { table: string; op: string; payload?: unknown; id?: string };

function fakeClient(rows: DeliveryRow[], orders: Record<string, OrderRow>) {
  const calls: Call[] = [];
  const from = (table: string) => {
    if (table === 'notification_deliveries') {
      return {
        select: () => ({ in: () => ({ data: rows, error: null }) }),
        update: (payload: unknown) => ({
          eq: (_col: string, id: string) => { calls.push({ table, op: 'update', payload, id }); return { error: null }; },
        }),
      };
    }
    return {
      select: () => ({
        eq: (_col: string, value: string) => ({ maybeSingle: async () => ({ data: orders[value] ?? null, error: null }) }),
      }),
    };
  };
  return { client: { from }, calls };
}

const order = { display_number: 'RO-1', total_minor: 12300, public_token: 'tok' };
const sendOk = async () => ({ accepted: true as const });
const sendFail = async () => ({ accepted: false as const, retryable: true as const });
const now = () => new Date('2026-08-18T12:00:00.000Z');
// 15-min stale cutoff => 2026-08-18T11:45:00.000Z

const failedRow = (over: Partial<DeliveryRow> = {}): DeliveryRow => ({
  id: 'd1', order_id: 'o1', type: 'delivered', recipient: 'buyer@example.com', locale: 'en', attempts: 1, status: 'failed', created_at: '2026-08-18T00:00:00.000Z', ...over,
});

describe('retryStuckNotifications', () => {
  it('re-sends a failed row under the attempt limit and marks it sent', async () => {
    const { client, calls } = fakeClient([failedRow()], { o1: order });
    const summary = await retryStuckNotifications(client, { sendNotification: sendOk, now });
    expect(summary).toEqual({ retried: 1, sent: 1, failed: 0, skipped: 0 });
    const update = calls.find((c) => c.table === 'notification_deliveries' && c.op === 'update');
    expect(update!.payload).toMatchObject({ status: 'sent', attempts: 2 });
  });

  it('re-sends a stale pending row', async () => {
    const row = failedRow({ status: 'pending', attempts: 0, created_at: '2026-08-18T11:44:00.000Z' });
    const { client, calls } = fakeClient([row], { o1: order });
    const summary = await retryStuckNotifications(client, { sendNotification: sendOk, now });
    expect(summary).toEqual({ retried: 1, sent: 1, failed: 0, skipped: 0 });
    expect(calls.some((c) => c.table === 'notification_deliveries' && c.op === 'update')).toBe(true);
  });

  it('skips a fresh pending row', async () => {
    const row = failedRow({ status: 'pending', attempts: 0, created_at: '2026-08-18T11:50:00.000Z' });
    const { client, calls } = fakeClient([row], { o1: order });
    const summary = await retryStuckNotifications(client, { sendNotification: sendOk, now });
    expect(summary).toEqual({ retried: 0, sent: 0, failed: 0, skipped: 1 });
    expect(calls).toEqual([]);
  });

  it('skips a failed row that already reached the attempt limit', async () => {
    const row = failedRow({ attempts: MAX_ATTEMPTS });
    const { client, calls } = fakeClient([row], { o1: order });
    const summary = await retryStuckNotifications(client, { sendNotification: sendOk, now });
    expect(summary).toEqual({ retried: 0, sent: 0, failed: 0, skipped: 1 });
    expect(calls).toEqual([]);
  });

  it('marks a row failed and increments attempts when the send fails', async () => {
    const { client, calls } = fakeClient([failedRow()], { o1: order });
    const summary = await retryStuckNotifications(client, { sendNotification: sendFail, now });
    expect(summary).toEqual({ retried: 1, sent: 0, failed: 1, skipped: 0 });
    const update = calls.find((c) => c.table === 'notification_deliveries' && c.op === 'update');
    expect(update!.payload).toMatchObject({ status: 'failed', attempts: 2, last_error: 'smtp_failed' });
  });

  it('marks an unknown type failed without sending', async () => {
    const row = failedRow({ type: 'not_a_type' });
    const { client, calls } = fakeClient([row], { o1: order });
    const summary = await retryStuckNotifications(client, { sendNotification: sendOk, now });
    expect(summary).toEqual({ retried: 0, sent: 0, failed: 0, skipped: 1 });
    const update = calls.find((c) => c.table === 'notification_deliveries' && c.op === 'update');
    expect(update!.payload).toMatchObject({ status: 'failed', last_error: 'unknown_type' });
  });

  it('marks a row failed when its order is missing', async () => {
    const { client, calls } = fakeClient([failedRow()], {});
    const summary = await retryStuckNotifications(client, { sendNotification: sendOk, now });
    expect(summary).toEqual({ retried: 0, sent: 0, failed: 0, skipped: 1 });
    const update = calls.find((c) => c.table === 'notification_deliveries' && c.op === 'update');
    expect(update!.payload).toMatchObject({ status: 'failed', last_error: 'order_missing' });
  });

  it('builds the order URL from the orderUrlBase + public token', async () => {
    const sent: Array<string> = [];
    const send = async (input: { orderUrl: string }) => { sent.push(input.orderUrl); return { accepted: true as const }; };
    const { client } = fakeClient([failedRow()], { o1: { ...order, public_token: 'tok-123' } });
    await retryStuckNotifications(client, { sendNotification: send as never, now, orderUrlBase: 'https://shop.example.com/' });
    expect(sent[0]).toBe('https://shop.example.com/orders/o1?token=tok-123');
  });

  it('retries a failed row under a custom attempt cap', async () => {
    const row = failedRow({ attempts: MAX_ATTEMPTS });
    const { client, calls } = fakeClient([row], { o1: order });
    const summary = await retryStuckNotifications(client, { sendNotification: sendOk, now, maxAttempts: 5 });
    expect(summary).toEqual({ retried: 1, sent: 1, failed: 0, skipped: 0 });
    expect(calls.some((c) => c.table === 'notification_deliveries' && c.op === 'update')).toBe(true);
  });

  it('retries a recent pending row under a custom stale window', async () => {
    const row = failedRow({ status: 'pending', attempts: 0, created_at: '2026-08-18T11:50:00.000Z' });
    const { client } = fakeClient([row], { o1: order });
    const summary = await retryStuckNotifications(client, { sendNotification: sendOk, now, stalePendingMs: 10 * 60 * 1000 });
    expect(summary).toEqual({ retried: 1, sent: 1, failed: 0, skipped: 0 });
  });
});

describe('resolveRetryLimits', () => {
  it('returns defaults when the environment is empty', () => {
    expect(resolveRetryLimits({})).toEqual({ maxAttempts: MAX_ATTEMPTS, stalePendingMs: STALE_PENDING_MS });
  });

  it('applies valid overrides', () => {
    expect(resolveRetryLimits({ NOTIFICATION_RETRY_MAX_ATTEMPTS: '5', NOTIFICATION_RETRY_STALE_PENDING_MINUTES: '30' })).toEqual({ maxAttempts: 5, stalePendingMs: 30 * 60 * 1000 });
  });

  it('ignores non-positive or non-numeric values', () => {
    expect(resolveRetryLimits({ NOTIFICATION_RETRY_MAX_ATTEMPTS: 'abc', NOTIFICATION_RETRY_STALE_PENDING_MINUTES: '0' })).toEqual({ maxAttempts: MAX_ATTEMPTS, stalePendingMs: STALE_PENDING_MS });
    expect(resolveRetryLimits({ NOTIFICATION_RETRY_MAX_ATTEMPTS: '-1', NOTIFICATION_RETRY_STALE_PENDING_MINUTES: '12.5' })).toEqual({ maxAttempts: MAX_ATTEMPTS, stalePendingMs: STALE_PENDING_MS });
  });
});
