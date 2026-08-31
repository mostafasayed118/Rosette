import { describe, expect, it } from 'vitest';
import { checkDeliveryDate, isDeliveryDateEligible } from '@/features/delivery/eligibility';

describe('delivery date eligibility', () => {
  it('accepts a valid non-Friday date', () => {
    expect(checkDeliveryDate('2026-09-05')).toEqual({ eligible: true });
    expect(isDeliveryDateEligible('2026-09-05')).toBe(true);
  });

  it('rejects Fridays consistently', () => {
    expect(checkDeliveryDate('2026-09-04')).toEqual({ eligible: false, reason: 'closed_weekday' });
    expect(isDeliveryDateEligible('2026-09-04')).toBe(false);
  });

  it('rejects malformed and impossible dates', () => {
    expect(checkDeliveryDate('2026/09/05')).toEqual({ eligible: false, reason: 'invalid_date' });
    expect(checkDeliveryDate('2026-02-30')).toEqual({ eligible: false, reason: 'invalid_date' });
  });
});
