import { describe, expect, it } from 'vitest';
import { estimateDeliveryFeeMinor } from '@/features/destination/delivery-fee';

describe('estimateDeliveryFeeMinor', () => {
  it('returns 1500 for same-day cities', () => {
    expect(estimateDeliveryFeeMinor('greater-cairo')).toBe(1500);
    expect(estimateDeliveryFeeMinor('alexandria')).toBe(1500);
  });

  it('returns 2500 for next-day cities', () => {
    expect(estimateDeliveryFeeMinor('mansoura')).toBe(2500);
    expect(estimateDeliveryFeeMinor('north-coast')).toBe(2500);
  });

  it('returns null for unknown or missing cities', () => {
    expect(estimateDeliveryFeeMinor('atlantis')).toBeNull();
    expect(estimateDeliveryFeeMinor(null)).toBeNull();
    expect(estimateDeliveryFeeMinor(undefined)).toBeNull();
  });
});