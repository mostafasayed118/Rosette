import { describe, expect, it } from 'vitest';
import { diffTouchesGroupOwnedField } from '@/features/orders/change-request';

describe('change request group-owned field guard', () => {
  it('flags a delivery_date change as group-owned', () => {
    expect(diffTouchesGroupOwnedField({ delivery_date: '2026-09-10' })).toBe(true);
  });

  it('flags each group-owned field', () => {
    expect(diffTouchesGroupOwnedField({ delivery_window: '3-6' })).toBe(true);
    expect(diffTouchesGroupOwnedField({ recipient_name: 'New' })).toBe(true);
    expect(diffTouchesGroupOwnedField({ recipient_phone: '0100' })).toBe(true);
    expect(diffTouchesGroupOwnedField({ delivery_address: 'New address' })).toBe(true);
  });

  it('does not flag item-only changes', () => {
    expect(diffTouchesGroupOwnedField({ items: [{ id: 'i1', quantity: 2 }] })).toBe(false);
    expect(diffTouchesGroupOwnedField({ items: [{ id: 'i1', gift_message: 'hi' }] })).toBe(false);
  });

  it('does not flag an empty diff', () => {
    expect(diffTouchesGroupOwnedField({})).toBe(false);
  });
});
