import { describe, expect, it } from 'vitest';
import { releaseReservation, reserveInventory } from '@/features/inventory/service';

describe('inventory reservations', () => {
  it('reserves only available quantity', () => {
    expect(reserveInventory({ quantity: 5, reserved: 1 }, 2)).toEqual({
      ok: true,
      next: { quantity: 5, reserved: 3 },
    });
  });

  it('rejects a reservation larger than available stock', () => {
    expect(reserveInventory({ quantity: 2, reserved: 2 }, 1)).toEqual({ ok: false, reason: 'insufficient_stock' });
  });

  it('releases no more than the current reservation', () => {
    expect(releaseReservation({ quantity: 5, reserved: 2 }, 4)).toEqual({ quantity: 5, reserved: 0 });
  });
});
