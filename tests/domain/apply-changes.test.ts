import { describe, expect, it } from 'vitest';
import { applyChanges } from '@/features/orders/change-request';

const order = { subtotal_minor: 10000, delivery_fee_minor: 1500, discount_minor: 0, total_minor: 11500 };
const items = [
  { id: 'i1', unit_price_minor: 6000, quantity: 1, gift_message: '' },
  { id: 'i2', unit_price_minor: 4000, quantity: 1, gift_message: 'hi' },
];

describe('applyChanges', () => {
  it('applies field-only diffs with no delta', () => {
    const result = applyChanges(order, items, { delivery_date: '2026-08-20' });
    expect(result).toEqual({ ok: true, fields: { delivery_date: '2026-08-20' }, items, subtotalMinor: 10000, totalMinor: 11500, deltaMinor: 0 });
  });

  it('increases the total when a quantity goes up', () => {
    const result = applyChanges(order, items, { items: [{ id: 'i1', quantity: 2 }] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.subtotalMinor).toBe(16000);
    expect(result.totalMinor).toBe(17500);
    expect(result.deltaMinor).toBe(6000);
    expect(result.items[0]).toEqual({ id: 'i1', unit_price_minor: 6000, quantity: 2, gift_message: '' });
    expect(result.items[1]).toEqual(items[1]);
  });

  it('reduces the total when a quantity goes down', () => {
    // i2 starts at quantity 2, so dropping it to 1 yields delta = -4000.
    const downOrder = { subtotal_minor: 14000, delivery_fee_minor: 1500, discount_minor: 0, total_minor: 15500 };
    const downItems = [
      { id: 'i1', unit_price_minor: 6000, quantity: 1, gift_message: '' },
      { id: 'i2', unit_price_minor: 4000, quantity: 2, gift_message: 'hi' },
    ];
    const result = applyChanges(downOrder, downItems, { items: [{ id: 'i2', quantity: 1, gift_message: '' }] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.subtotalMinor).toBe(10000);
    expect(result.totalMinor).toBe(11500);
    expect(result.deltaMinor).toBe(-4000);
  });

  it('keeps the total unchanged for a gift-message-only edit', () => {
    const result = applyChanges(order, items, { items: [{ id: 'i2', gift_message: 'lots of love' }] });
    expect(result).toEqual({ ok: true, fields: {}, items: [{ ...items[0] }, { ...items[1], gift_message: 'lots of love' }], subtotalMinor: 10000, totalMinor: 11500, deltaMinor: 0 });
  });

  it('applies a discount when computing the total', () => {
    const result = applyChanges({ ...order, discount_minor: 1000 }, items, { delivery_window: '17:00-19:00' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.totalMinor).toBe(10500);
  });

  it('rejects an unknown item id', () => {
    const result = applyChanges(order, items, { items: [{ id: 'nope', quantity: 2 }] });
    expect(result).toEqual({ ok: false, reason: 'unknown_item' });
  });

  it('re-validates quantities defensively (stored junk)', () => {
    expect(applyChanges(order, items, { items: [{ id: 'i1', quantity: 0 }] })).toEqual({ ok: false, reason: 'invalid_quantity' });
    expect(applyChanges(order, items, { items: [{ id: 'i1', quantity: 1.5 }] })).toEqual({ ok: false, reason: 'invalid_quantity' });
  });

  it('does not mutate the input items', () => {
    const before = JSON.stringify(items);
    applyChanges(order, items, { items: [{ id: 'i1', quantity: 3 }] });
    expect(JSON.stringify(items)).toBe(before);
  });
});
