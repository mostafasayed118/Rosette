import { describe, expect, it } from 'vitest';
import { applyDeliveryRule, fetchDeliveryRule, DEFAULT_DELIVERY_FEE_MINOR } from '@/features/order/delivery-rules';

type Row = { fee_minor: number; minimum_order_minor: number; cutoff_hour: number };

function fakeClient(rule: Row | null) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: rule, error: null }),
          }),
        }),
      }),
    }),
  };
}

describe('applyDeliveryRule', () => {
  it('uses the rule fee when a rule exists', () => {
    expect(applyDeliveryRule({ feeMinor: 7500, minimumOrderMinor: 0, cutoffHour: 14 }, 12000).feeMinor).toBe(7500);
  });

  it('falls back to the default fee when no rule exists', () => {
    expect(applyDeliveryRule(null, 12000).feeMinor).toBe(DEFAULT_DELIVERY_FEE_MINOR);
  });

  it('falls back to a provided fee when no rule exists', () => {
    expect(applyDeliveryRule(null, 12000, 2500).feeMinor).toBe(2500);
  });

  it('flags belowMinimum when the subtotal is under the rule minimum', () => {
    expect(applyDeliveryRule({ feeMinor: 7500, minimumOrderMinor: 20000, cutoffHour: 14 }, 12000)).toEqual({ feeMinor: 7500, belowMinimum: true });
  });

  it('does not flag belowMinimum without a rule', () => {
    expect(applyDeliveryRule(null, 12000).belowMinimum).toBe(false);
  });
});

describe('fetchDeliveryRule', () => {
  it('maps a database row to a delivery rule', async () => {
    const rule = await fetchDeliveryRule(fakeClient({ fee_minor: 10000, minimum_order_minor: 0, cutoff_hour: 15 }), 'mansoura');
    expect(rule).toEqual({ feeMinor: 10000, minimumOrderMinor: 0, cutoffHour: 15 });
  });

  it('returns null when no rule matches', async () => {
    expect(await fetchDeliveryRule(fakeClient(null), 'atlantis')).toBeNull();
  });
});
