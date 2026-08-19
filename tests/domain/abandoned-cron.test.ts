import { describe, expect, it, vi } from 'vitest';
import { runAbandonedCartCron } from '@/features/cart/abandoned-cron';
import type { CartLine } from '@/features/cart/types';

const line: CartLine = { id: 'l1', productSlug: 'rose-hour', productName: 'Rose Hour', tone: '#bc6d63', unitPrice: 12000, quantity: 1, addOns: [], message: '', deliveryDate: '2026-08-20' };
const now = new Date('2026-08-19T12:00:00Z');

type SendInput = { to: string; locale: string; items: CartLine[]; restoreUrl: string };

function row(overrides: Record<string, unknown> = {}) {
  return { id: 'c1', email: 'a@b.com', locale: 'en', city: 'cairo', lines: [line], restore_token: 't1', ...overrides };
}

function fakeClient(rows: unknown[]) {
  const calls: Array<{ table: string; op: string; payload?: unknown }> = [];
  const client = {
    from: (table: string) => ({
      select: () => ({ is: () => ({ is: () => ({ lt: () => ({ data: rows, error: null }) }) }) }),
      update: (payload: unknown) => { calls.push({ table, op: 'update', payload }); return { eq: () => ({ error: null }) }; },
    }),
  };
  return { client, calls };
}

describe('runAbandonedCartCron', () => {
  it('emails stale, unconverted, un-emailed carts and stamps last_emailed_at', async () => {
    const send = vi.fn(async (_input: SendInput) => {});
    const { client, calls } = fakeClient([row()]);
    const summary = await runAbandonedCartCron(client, { origin: 'https://x', send, now });
    expect(summary).toEqual({ checked: 1, sent: 1, failed: 0 });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]![0]).toMatchObject({ to: 'a@b.com', locale: 'en', restoreUrl: 'https://x/en/cairo/cart?restore=t1' });
    const update = calls.find((c) => c.table === 'carts' && c.op === 'update');
    expect(update?.payload).toEqual({ last_emailed_at: now.toISOString() });
  });

  it('counts a failed send and does not stamp last_emailed_at', async () => {
    const send = vi.fn(async (_input: SendInput) => { throw new Error('smtp down'); });
    const { client, calls } = fakeClient([row()]);
    const summary = await runAbandonedCartCron(client, { origin: 'https://x', send, now });
    expect(summary).toEqual({ checked: 1, sent: 0, failed: 1 });
    expect(calls.filter((c) => c.op === 'update')).toEqual([]);
  });

  it('skips rows with empty lines', async () => {
    const send = vi.fn(async (_input: SendInput) => {});
    const { client } = fakeClient([row({ lines: [] })]);
    const summary = await runAbandonedCartCron(client, { origin: 'https://x', send, now });
    expect(summary).toEqual({ checked: 1, sent: 0, failed: 0 });
    expect(send).not.toHaveBeenCalled();
  });

  it('defaults the locale to en and the city to cairo for missing fields', async () => {
    const send = vi.fn(async (_input: SendInput) => {});
    const { client } = fakeClient([row({ locale: 'xx', city: '' })]);
    await runAbandonedCartCron(client, { origin: 'https://x', send, now });
    expect(send.mock.calls[0]![0]).toMatchObject({ locale: 'en', restoreUrl: 'https://x/en/cairo/cart?restore=t1' });
  });
});
