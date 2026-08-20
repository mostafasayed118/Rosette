import { describe, expect, it } from 'vitest';
import { FIXED_GIFT_CARD_AMOUNTS, validateGiftCardAmount, validateGiftCardPurchaseInput } from '@/features/gift-cards/validation';

describe('gift-card amount validation', () => {
  it('accepts supported fixed denominations', () => {
    expect(FIXED_GIFT_CARD_AMOUNTS).toEqual([50000, 100000, 250000, 500000]);
    expect(validateGiftCardAmount({ mode: 'fixed', amountMinor: 100000 })).toEqual({ ok: true, amountMinor: 100000 });
  });

  it('accepts custom amounts only within the configured integer bounds', () => {
    expect(validateGiftCardAmount({ mode: 'custom', amountMinor: 50000 })).toEqual({ ok: true, amountMinor: 50000 });
    expect(validateGiftCardAmount({ mode: 'custom', amountMinor: 5000000 })).toEqual({ ok: true, amountMinor: 5000000 });
    expect(validateGiftCardAmount({ mode: 'custom', amountMinor: 49999 })).toEqual({ ok: false, error: 'invalid_amount' });
    expect(validateGiftCardAmount({ mode: 'custom', amountMinor: 5000001 })).toEqual({ ok: false, error: 'invalid_amount' });
  });

  it('rejects unsupported modes and non-integer amounts', () => {
    expect(validateGiftCardAmount({ mode: 'fixed', amountMinor: 75000 })).toEqual({ ok: false, error: 'invalid_amount' });
    expect(validateGiftCardAmount({ mode: 'custom', amountMinor: 100.5 })).toEqual({ ok: false, error: 'invalid_amount' });
    expect(validateGiftCardAmount({ mode: 'custom', amountMinor: Number.NaN })).toEqual({ ok: false, error: 'invalid_amount' });
  });
});

describe('gift-card purchase input validation', () => {
  const input = {
    mode: 'fixed' as const,
    amountMinor: 100000,
    senderName: 'Maya',
    senderEmail: 'maya@example.com',
    recipientName: 'Nour',
    recipientEmail: 'nour@example.com',
    message: 'A little joy for you',
    locale: 'en' as const,
  };

  it('normalizes valid input without exposing a code', () => {
    expect(validateGiftCardPurchaseInput({ ...input, senderEmail: ' Maya@Example.com ' })).toEqual({
      ok: true,
      value: { ...input, senderEmail: 'maya@example.com', recipientEmail: 'nour@example.com' },
    });
  });

  it('rejects malformed email, locale, and overlong message', () => {
    expect(validateGiftCardPurchaseInput({ ...input, senderEmail: 'not-an-email' })).toMatchObject({ ok: false, error: 'invalid_input' });
    expect(validateGiftCardPurchaseInput({ ...input, locale: 'de' as never })).toMatchObject({ ok: false, error: 'invalid_input' });
    expect(validateGiftCardPurchaseInput({ ...input, message: 'x'.repeat(501) })).toMatchObject({ ok: false, error: 'invalid_input' });
  });
});
