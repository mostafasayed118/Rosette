import { describe, expect, it } from 'vitest';
import { canRequestChange, parseChangeRequestDiff, requiresReview } from '@/features/orders/change-request';

describe('canRequestChange', () => {
  it('returns not_found when the order is missing', () => {
    expect(canRequestChange(null)).toBe('not_found');
  });
  it('returns request_pending when a request is already pending', () => {
    expect(canRequestChange({ fulfillmentStatus: 'confirmed', paymentStatus: 'pending', hasPendingRequest: true })).toBe('request_pending');
  });
  it('returns not_changeable when the order was cancelled', () => {
    expect(canRequestChange({ fulfillmentStatus: 'cancelled', paymentStatus: 'pending', hasPendingRequest: false })).toBe('not_changeable');
  });
  it('returns not_changeable when the order was delivered', () => {
    expect(canRequestChange({ fulfillmentStatus: 'delivered', paymentStatus: 'paid', hasPendingRequest: false })).toBe('not_changeable');
  });
  it('returns not_changeable when the payment was refunded', () => {
    expect(canRequestChange({ fulfillmentStatus: 'confirmed', paymentStatus: 'refunded', hasPendingRequest: false })).toBe('not_changeable');
  });
  it('returns ok for a confirmed, unpaid order', () => {
    expect(canRequestChange({ fulfillmentStatus: 'confirmed', paymentStatus: 'pending', hasPendingRequest: false })).toBe('ok');
  });
});

describe('requiresReview', () => {
  it('reviews paid orders', () => {
    expect(requiresReview({ fulfillmentStatus: 'confirmed', paymentStatus: 'paid' })).toBe(true);
  });
  it('reviews mid-fulfillment orders even when unpaid', () => {
    expect(requiresReview({ fulfillmentStatus: 'preparing', paymentStatus: 'pending' })).toBe(true);
  });
  it('auto-applies confirmed unpaid orders', () => {
    expect(requiresReview({ fulfillmentStatus: 'confirmed', paymentStatus: 'pending' })).toBe(false);
  });
});

describe('parseChangeRequestDiff', () => {
  it('accepts a valid diff', () => {
    const result = parseChangeRequestDiff({ delivery_date: '2026-08-20', delivery_window: '17:00-19:00', items: [{ id: 'i1', quantity: 3, gift_message: 'hi' }] });
    expect(result).toEqual({ ok: true, diff: { delivery_date: '2026-08-20', delivery_window: '17:00-19:00', items: [{ id: 'i1', quantity: 3, gift_message: 'hi' }] } });
  });
  it('rejects an empty diff', () => {
    expect(parseChangeRequestDiff({})).toEqual({ ok: false, error: 'empty_diff' });
  });
  it('rejects a non-object payload', () => {
    expect(parseChangeRequestDiff('nope')).toEqual({ ok: false, error: 'invalid' });
  });
  it('rejects an invalid date', () => {
    expect(parseChangeRequestDiff({ delivery_date: 'tomorrow' })).toEqual({ ok: false, error: 'invalid_date' });
  });
  it('rejects a zero, fractional, or non-numeric quantity', () => {
    expect(parseChangeRequestDiff({ items: [{ id: 'i1', quantity: 0 }] })).toEqual({ ok: false, error: 'invalid_quantity' });
    expect(parseChangeRequestDiff({ items: [{ id: 'i1', quantity: 1.5 }] })).toEqual({ ok: false, error: 'invalid_quantity' });
    expect(parseChangeRequestDiff({ items: [{ id: 'i1', quantity: '2' }] })).toEqual({ ok: false, error: 'invalid_quantity' });
  });
  it('rejects an item entry with nothing to change', () => {
    expect(parseChangeRequestDiff({ items: [{ id: 'i1' }] })).toEqual({ ok: false, error: 'invalid' });
  });
  it('allows an empty gift message to clear it', () => {
    expect(parseChangeRequestDiff({ items: [{ id: 'i1', gift_message: '' }] })).toEqual({ ok: true, diff: { items: [{ id: 'i1', gift_message: '' }] } });
  });
  it('rejects unknown keys (city is not changeable)', () => {
    expect(parseChangeRequestDiff({ delivery_city_code: 'cai' })).toEqual({ ok: false, error: 'invalid' });
  });
  it('trims and keeps only non-empty strings', () => {
    expect(parseChangeRequestDiff({ recipient_name: '  Sam  ' })).toEqual({ ok: true, diff: { recipient_name: 'Sam' } });
    expect(parseChangeRequestDiff({ recipient_name: '   ' })).toEqual({ ok: false, error: 'invalid' });
  });
});
