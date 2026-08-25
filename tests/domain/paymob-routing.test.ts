import { describe, expect, it } from 'vitest';
import { parsePaymobSpecialReference } from '@/features/payment/paymob-routing';

describe('parsePaymobSpecialReference', () => {
  it('returns null for empty, null, or whitespace input', () => {
    expect(parsePaymobSpecialReference('')).toBeNull();
    expect(parsePaymobSpecialReference(null)).toBeNull();
    expect(parsePaymobSpecialReference(undefined)).toBeNull();
    expect(parsePaymobSpecialReference('   ')).toBeNull();
  });

  it('returns the giftcard kind with the purchase id', () => {
    expect(parsePaymobSpecialReference('giftcard:purchase-1')).toEqual({ kind: 'giftcard', reference: 'purchase-1' });
  });

  it('returns null when the giftcard prefix is present but the id is empty', () => {
    expect(parsePaymobSpecialReference('giftcard:')).toBeNull();
  });

  it('returns the change kind with the change-request id', () => {
    expect(parsePaymobSpecialReference('change:req-7')).toEqual({ kind: 'change', reference: 'req-7' });
  });

  it('returns null when the change prefix is present but the id is empty', () => {
    expect(parsePaymobSpecialReference('change:')).toBeNull();
  });

  it('treats an unprefixed value as a normal order reference', () => {
    expect(parsePaymobSpecialReference('RO-ABC123')).toEqual({ kind: 'order', reference: 'RO-ABC123' });
  });
});
