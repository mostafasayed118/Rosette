import { describe, expect, it } from 'vitest';
import { canUpdateOrderStatus } from '@/features/admin/authorization';

describe('admin authorization', () => {
  it('allows operators to move orders through fulfillment', () => {
    expect(canUpdateOrderStatus('operator', 'confirmed', 'preparing')).toBe(true);
    expect(canUpdateOrderStatus('operator', 'confirmed', 'cancelled')).toBe(false);
  });

  it('allows admins to cancel a confirmed order', () => {
    expect(canUpdateOrderStatus('admin', 'confirmed', 'cancelled')).toBe(true);
  });

  it('rejects invalid transitions for every role', () => {
    expect(canUpdateOrderStatus('admin', 'delivered', 'preparing')).toBe(false);
  });
});
