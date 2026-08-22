import { describe, expect, it, vi } from 'vitest';
import { runOccasionCron } from '@/features/occasions/occasions-cron';

type Row = Record<string, any>;

function fakeClient(options: { occasions: Row[]; reminders?: Row[]; orders?: Row[] }) {
  const reminders: Row[] = [...(options.reminders ?? [])];
  const orders: Row[] = options.orders ?? [];

  const builder = (table: string) => {
    if (table === 'occasions') {
      return { select: () => Promise.resolve({ data: options.occasions, error: null }) };
    }
    if (table === 'orders') {
      const chain: any = {
        select: () => chain,
        eq: () => chain,
        gte: () => chain,
        lte: () => chain,
        then: (resolve: (value: { data: Row[]; error: null }) => unknown) => resolve({ data: orders, error: null }),
      };
      return chain;
    }
    if (table === 'occasion_reminders') {
      return {
        insert: (row: Row) => {
          const clash = reminders.some((r) => r.occasion_id === row.occasion_id && r.cycle_year === row.cycle_year);
          if (clash) {
            return { select: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: { message: 'duplicate key' } }) }) };
          }
          reminders.push({ ...row, id: `rem-${reminders.length + 1}` });
          const created = reminders[reminders.length - 1];
          return { select: () => ({ maybeSingle: () => Promise.resolve({ data: created, error: null }) }) };
        },
        update: (patch: Row) => ({
          eq: (_col: string, value: string) => {
            const target = reminders.find((r) => r.id === value);
            if (target) Object.assign(target, patch);
            return Promise.resolve({ error: null });
          },
        }),
      };
    }
    throw new Error(`unexpected table ${table}`);
  };

  return { client: { from: builder }, reminders };
}

const annualOccasion = (overrides: Row = {}): Row => ({
  id: 'occ-1',
  customer_id: 'cust-1',
  recipient_id: 'rec-1',
  kind: 'birthday',
  recurrence: 'annual',
  month: 3,
  day: 14,
  event_date: null,
  lead_days: 7,
  locale: 'en',
  active: true,
  recipients: { id: 'rec-1', name: 'Mum' },
  profiles: { email: 'nour@example.com' },
  ...overrides,
});

const enabled = () => Promise.resolve({ status: 'enabled' as const });

describe('runOccasionCron', () => {
  it('sends a reminder when one is due', async () => {
    const { client, reminders } = fakeClient({ occasions: [annualOccasion()] });
    const send = vi.fn().mockResolvedValue(undefined);
    const summary = await runOccasionCron(client, { origin: 'https://rosette.test', today: '2026-03-07', send, secret: 's', getPreference: enabled });

    expect(summary).toEqual({ checked: 1, sent: 1, failed: 0, suppressed: 0 });
    const payload = send.mock.calls[0]![0] as Record<string, any>;
    expect(payload.to).toBe('nour@example.com');
    expect(payload.recipientName).toBe('Mum');
    expect(payload.daysUntil).toBe(7);
    expect(payload.shopUrl).toContain('occasion=birthday');
    expect(reminders[0]!.cycle_year).toBe(2026);
  });

  it('sends nothing before the reminder date', async () => {
    const { client } = fakeClient({ occasions: [annualOccasion()] });
    const send = vi.fn();
    const summary = await runOccasionCron(client, { origin: 'https://rosette.test', today: '2026-03-01', send, secret: 's', getPreference: enabled });
    expect(summary).toEqual({ checked: 1, sent: 0, failed: 0, suppressed: 0 });
    expect(send).not.toHaveBeenCalled();
  });

  it('is idempotent: a claimed cycle is skipped', async () => {
    const { client } = fakeClient({
      occasions: [annualOccasion()],
      reminders: [{ id: 'rem-existing', occasion_id: 'occ-1', cycle_year: 2026, sent_at: '2026-03-07T09:00:00Z' }],
    });
    const send = vi.fn();
    const summary = await runOccasionCron(client, { origin: 'https://rosette.test', today: '2026-03-08', send, secret: 's', getPreference: enabled });
    expect(send).not.toHaveBeenCalled();
    expect(summary.sent).toBe(0);
  });

  it('still sends after a missed run, up to the occasion date', async () => {
    const { client } = fakeClient({ occasions: [annualOccasion()] });
    const send = vi.fn().mockResolvedValue(undefined);
    const summary = await runOccasionCron(client, { origin: 'https://rosette.test', today: '2026-03-11', send, secret: 's', getPreference: enabled });
    expect(summary.sent).toBe(1);
    expect((send.mock.calls[0]![0] as Record<string, any>).daysUntil).toBe(3);
  });

  it('suppresses when engagement email is disabled', async () => {
    const { client, reminders } = fakeClient({ occasions: [annualOccasion()] });
    const send = vi.fn();
    const summary = await runOccasionCron(client, {
      origin: 'https://rosette.test',
      today: '2026-03-07',
      send,
      secret: 's',
      getPreference: () => Promise.resolve({ status: 'disabled' as const }),
    });
    expect(send).not.toHaveBeenCalled();
    expect(summary.suppressed).toBe(1);
    expect(reminders[0]!.suppressed_reason).toBe('engagement_disabled');
  });

  it('suppresses when a paid order already covers the occasion', async () => {
    const { client, reminders } = fakeClient({
      occasions: [annualOccasion()],
      orders: [{ id: 'ord-1', recipient_name: 'Mum', delivery_date: '2026-03-14', payment_status: 'paid' }],
    });
    const send = vi.fn();
    const summary = await runOccasionCron(client, { origin: 'https://rosette.test', today: '2026-03-07', send, secret: 's', getPreference: enabled });
    expect(send).not.toHaveBeenCalled();
    expect(summary.suppressed).toBe(1);
    expect(reminders[0]!.suppressed_reason).toBe('already_ordered');
    expect(reminders[0]!.converted_order_id).toBe('ord-1');
  });

  it('counts a send failure without aborting the run', async () => {
    const { client } = fakeClient({ occasions: [annualOccasion(), annualOccasion({ id: 'occ-2' })] });
    const send = vi.fn().mockRejectedValueOnce(new Error('smtp down')).mockResolvedValueOnce(undefined);
    const summary = await runOccasionCron(client, { origin: 'https://rosette.test', today: '2026-03-07', send, secret: 's', getPreference: enabled });
    expect(summary.checked).toBe(2);
    expect(summary.failed).toBe(1);
    expect(summary.sent).toBe(1);
  });

  it('counts a preference lookup error as failed, not sent', async () => {
    const { client } = fakeClient({ occasions: [annualOccasion()] });
    const send = vi.fn();
    const summary = await runOccasionCron(client, {
      origin: 'https://rosette.test',
      today: '2026-03-07',
      send,
      secret: 's',
      getPreference: () => Promise.resolve({ status: 'error' as const }),
    });
    expect(send).not.toHaveBeenCalled();
    expect(summary.failed).toBe(1);
  });

  it('skips an occasion with no email on file', async () => {
    const { client } = fakeClient({ occasions: [annualOccasion({ profiles: { email: null } })] });
    const send = vi.fn();
    const summary = await runOccasionCron(client, { origin: 'https://rosette.test', today: '2026-03-07', send, secret: 's', getPreference: enabled });
    expect(send).not.toHaveBeenCalled();
    expect(summary.failed).toBe(1);
  });

  it('ignores an expired one-off occasion', async () => {
    const { client } = fakeClient({
      occasions: [annualOccasion({ recurrence: 'once', month: null, day: null, event_date: '2026-01-05' })],
    });
    const send = vi.fn();
    const summary = await runOccasionCron(client, { origin: 'https://rosette.test', today: '2026-03-07', send, secret: 's', getPreference: enabled });
    expect(send).not.toHaveBeenCalled();
    expect(summary.sent).toBe(0);
  });
});
