import { describe, expect, it } from 'vitest';
import { buildTimeline, lookupOrder, type TrackedOrder } from '@/features/tracking/lookup-order';

type Call = { column: string; value: string };

function fakeClient(seed: { order?: Record<string, unknown> | null; error?: boolean }) {
  const calls: Call[] = [];
  const from = (table: string) => ({
    select: () => ({
      eq: (column: string, value: string) => {
        calls.push({ column, value });
        return {
          eq: (column2: string, value2: string) => {
            calls.push({ column: column2, value: value2 });
            return {
              maybeSingle: async () => (seed.error ? { data: null, error: { message: 'db down' } } : { data: seed.order ?? null, error: null }),
            };
          },
        };
      },
    }),
  });
  return { client: { from }, calls };
}

const orderRow = {
  display_number: 'RO-1024',
  customer_email: 'buyer@example.com',
  recipient_name: 'Sara',
  delivery_city_code: 'cairo',
  delivery_date: '2026-08-20',
  delivery_window: '12:00–16:00',
  payment_status: 'paid',
  fulfillment_status: 'out_for_delivery',
  subtotal_minor: 12000,
  delivery_fee_minor: 7500,
  total_minor: 19500,
  order_items: [{ product_name_en: 'Rose Hour', product_name_ar: 'ساعة الورد', quantity: 1, unit_price_minor: 12000, add_ons: [{ id: 'note', name_en: 'Handwritten note', name_ar: 'بطاقة', price_minor: 500 }] }],
  order_events: [
    { event_type: 'payment', from_status: null, to_status: null, created_at: '2026-08-18T08:00:00Z' },
    { event_type: 'status_change', from_status: 'confirmed', to_status: 'preparing', created_at: '2026-08-18T09:00:00Z' },
    { event_type: 'status_change', from_status: 'preparing', to_status: 'out_for_delivery', created_at: '2026-08-19T10:00:00Z' },
  ],
};

describe('lookupOrder', () => {
  it('maps a matching order into the TrackedOrder shape', async () => {
    const { client } = fakeClient({ order: orderRow });
    const result = await lookupOrder(client, { number: 'RO-1024', email: 'buyer@example.com' });
    expect(result).not.toBeNull();
    expect(result!.number).toBe('RO-1024');
    expect(result!.paymentStatus).toBe('paid');
    expect(result!.fulfillmentStatus).toBe('out_for_delivery');
    expect(result!.recipientName).toBe('Sara');
    expect(result!.deliveryDate).toBe('2026-08-20');
    expect(result!.deliveryWindow).toBe('12:00–16:00');
    expect(result!.subtotalMinor).toBe(12000);
    expect(result!.deliveryFeeMinor).toBe(7500);
    expect(result!.totalMinor).toBe(19500);
    expect(result!.items).toEqual([{ nameEn: 'Rose Hour', nameAr: 'ساعة الورد', quantity: 1, unitPriceMinor: 12000, addOns: [{ nameEn: 'Handwritten note', nameAr: 'بطاقة', priceMinor: 500 }] }]);
  });

  it('builds the timeline from fulfillment transitions only, sorted ascending', async () => {
    const { client } = fakeClient({ order: orderRow });
    const result = (await lookupOrder(client, { number: 'RO-1024', email: 'buyer@example.com' })) as TrackedOrder;
    expect(result.timeline).toEqual([
      { status: 'preparing', at: '2026-08-18T09:00:00Z' },
      { status: 'out_for_delivery', at: '2026-08-19T10:00:00Z' },
    ]);
  });

  it('queries by display_number and customer_email, then groups by order_id', async () => {
    const { client, calls } = fakeClient({ order: orderRow });
    await lookupOrder(client, { number: 'RO-1024', email: 'buyer@example.com' });
    expect(calls).toEqual([
      { column: 'display_number', value: 'RO-1024' },
      { column: 'customer_email', value: 'buyer@example.com' },
      { column: 'order_id', value: undefined },
    ]);
  });

  it('falls back to a synthetic group from order columns when no group rows resolve', async () => {
    const { client } = fakeClient({ order: orderRow });
    const result = await lookupOrder(client, { number: 'RO-1024', email: 'buyer@example.com' });
    expect(result!.groups).toHaveLength(1);
    expect(result!.groups[0]!.recipientName).toBe('Sara');
    expect(result!.groups[0]!.fulfillmentStatus).toBe('out_for_delivery');
  });

  it('returns null for a valid number with the wrong email', async () => {
    const { client } = fakeClient({ order: null });
    expect(await lookupOrder(client, { number: 'RO-1024', email: 'wrong@example.com' })).toBeNull();
  });

  it('returns null for an unknown number', async () => {
    const { client } = fakeClient({ order: null });
    expect(await lookupOrder(client, { number: 'RO-9999', email: 'buyer@example.com' })).toBeNull();
  });

  it('returns null on a database error', async () => {
    const { client } = fakeClient({ order: orderRow, error: true });
    expect(await lookupOrder(client, { number: 'RO-1024', email: 'buyer@example.com' })).toBeNull();
  });
});

describe('buildTimeline', () => {
  it('drops events whose to_status is not a fulfillment status', () => {
    const events = [
      { to_status: null, created_at: '2026-08-18T08:00:00Z' },
      { to_status: 'paid', created_at: '2026-08-18T08:30:00Z' },
      { to_status: 'preparing', created_at: '2026-08-18T09:00:00Z' },
    ];
    expect(buildTimeline(events)).toEqual([{ status: 'preparing', at: '2026-08-18T09:00:00Z' }]);
  });

  it('sorts ascending by created_at and keeps cancelled', () => {
    const events = [
      { to_status: 'delivered', created_at: '2026-08-19T10:00:00Z' },
      { to_status: 'cancelled', created_at: '2026-08-18T11:00:00Z' },
      { to_status: 'confirmed', created_at: '2026-08-18T09:00:00Z' },
    ];
    expect(buildTimeline(events)).toEqual([
      { status: 'confirmed', at: '2026-08-18T09:00:00Z' },
      { status: 'cancelled', at: '2026-08-18T11:00:00Z' },
      { status: 'delivered', at: '2026-08-19T10:00:00Z' },
    ]);
  });
});
