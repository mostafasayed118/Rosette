import { describe, expect, it } from 'vitest';
import { groupRefundForCancellation } from '@/features/order-mutations/cancel-actions';

describe('cancel-group refund cap', () => {
  it('caps a group refund so cumulative refunds do not exceed cash paid', () => {
    const a = groupRefundForCancellation({ itemsMinor: 500, feeMinor: 150 }, { totalMinor: 1100, giftCardMinor: 0, refundedSoFar: 0 });
    expect(a.amountMinor).toBe(500 + 150);
    expect(a.closesOrder).toBe(false);
    const b = groupRefundForCancellation({ itemsMinor: 500, feeMinor: 150 }, { totalMinor: 1100, giftCardMinor: 0, refundedSoFar: a.amountMinor });
    expect(b.amountMinor).toBe(1100 - a.amountMinor);
    expect(b.closesOrder).toBe(true);
  });

  it('an ordinary first group refund is not capped', () => {
    const r = groupRefundForCancellation({ itemsMinor: 400, feeMinor: 100 }, { totalMinor: 2000, giftCardMinor: 0, refundedSoFar: 0 });
    expect(r.amountMinor).toBe(500);
    expect(r.closesOrder).toBe(false);
  });

  it('never refunds more than the cash actually paid', () => {
    const r = groupRefundForCancellation({ itemsMinor: 2000, feeMinor: 500 }, { totalMinor: 3000, giftCardMinor: 2500, refundedSoFar: 0 });
    expect(r.amountMinor).toBe(500);
  });

  it('returns zero when the cash is already exhausted', () => {
    const r = groupRefundForCancellation({ itemsMinor: 400, feeMinor: 100 }, { totalMinor: 1000, giftCardMinor: 0, refundedSoFar: 1000 });
    expect(r.amountMinor).toBe(0);
    expect(r.closesOrder).toBe(true);
  });
});
