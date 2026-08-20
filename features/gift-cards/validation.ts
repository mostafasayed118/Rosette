import type { GiftCardAmount, GiftCardPurchaseInput } from './types';

export const FIXED_GIFT_CARD_AMOUNTS = [50000, 100000, 250000, 500000] as const;
export const MIN_CUSTOM_GIFT_CARD_MINOR = 50000;
export const MAX_CUSTOM_GIFT_CARD_MINOR = 5000000;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateGiftCardAmount(input: GiftCardAmount): { ok: true; amountMinor: number } | { ok: false; error: 'invalid_amount' } {
  if (!Number.isInteger(input.amountMinor) || input.amountMinor <= 0) return { ok: false, error: 'invalid_amount' };
  if (input.mode === 'fixed') return (FIXED_GIFT_CARD_AMOUNTS as readonly number[]).includes(input.amountMinor) ? { ok: true, amountMinor: input.amountMinor } : { ok: false, error: 'invalid_amount' };
  if (input.mode !== 'custom' || input.amountMinor < MIN_CUSTOM_GIFT_CARD_MINOR || input.amountMinor > MAX_CUSTOM_GIFT_CARD_MINOR) return { ok: false, error: 'invalid_amount' };
  return { ok: true, amountMinor: input.amountMinor };
}

export function validateGiftCardPurchaseInput(input: GiftCardPurchaseInput): { ok: true; value: GiftCardPurchaseInput } | { ok: false; error: 'invalid_input' | 'invalid_amount' } {
  const amount = validateGiftCardAmount(input);
  if (!amount.ok) return amount;
  const senderEmail = input.senderEmail.trim().toLowerCase();
  const recipientEmail = input.recipientEmail.trim().toLowerCase();
  if (!input.senderName.trim() || !input.recipientName.trim() || !EMAIL_PATTERN.test(senderEmail) || !EMAIL_PATTERN.test(recipientEmail) || !['en', 'ar', 'fr'].includes(input.locale) || input.message.length > 500) return { ok: false, error: 'invalid_input' };
  return { ok: true, value: { ...input, amountMinor: amount.amountMinor, senderName: input.senderName.trim(), recipientName: input.recipientName.trim(), senderEmail, recipientEmail, message: input.message.trim() } };
}
