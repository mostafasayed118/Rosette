import { describe, expect, it } from 'vitest';
import { validateRecipientGroups, checkoutDeliveryFeeMinor } from '@/features/checkout/recipient-groups';
import type { CartLine, CartRecipient } from '@/features/cart/types';

function recipient(id: string, patch: Partial<CartRecipient> = {}): CartRecipient {
  return { id, recipientName: 'Mom', recipientPhone: '01000000000', address: 'Cairo', deliveryDate: '2026-09-02', deliveryWindow: '12-3', ...patch };
}
function line(patch: Partial<CartLine> = {}): CartLine {
  return { id: 'l1', productSlug: 'rose', productName: 'Rose', tone: 'white', unitPrice: 1000, quantity: 1, addOns: [], message: '', deliveryDate: '2026-09-02', ...patch };
}

describe('checkout recipient groups', () => {
  it('is valid when lines are all assigned and groups are complete', () => {
    const r = recipient('r1');
    expect(validateRecipientGroups([r], [line({ recipientId: 'r1' })])).toBeNull();
  });

  it('rejects an unassigned line', () => {
    const r = recipient('r1');
    expect(validateRecipientGroups([r], [line()])).toBe('recipientsUnassigned');
  });

  it('rejects a line referencing an unknown group', () => {
    const r = recipient('r1');
    expect(validateRecipientGroups([r], [line({ recipientId: 'r-missing' })])).toBe('recipientsUnknown');
  });

  it('rejects an incomplete group', () => {
    const r = recipient('r1', { recipientName: '   ' });
    expect(validateRecipientGroups([r], [line({ recipientId: 'r1' })])).toBe('recipientsIncomplete');
  });

  it('rejects an empty-recipient cart passed as multi-recipient', () => {
    expect(validateRecipientGroups([], [line()])).toBeNull();
  });

  it('does not allow more than MAX_GROUPS groups', () => {
    const groups = Array.from({ length: 11 }, (_, i) => recipient(`r${i}`));
    expect(validateRecipientGroups(groups, [])).toBe('recipientsTooMany');
  });

  it('checkoutDeliveryFeeMinor multiplies the flat fee by group count (min 1)', () => {
    expect(checkoutDeliveryFeeMinor(1500, [recipient('r1'), recipient('r2')])).toBe(3000);
    expect(checkoutDeliveryFeeMinor(1500, [])).toBe(1500);
  });
});
