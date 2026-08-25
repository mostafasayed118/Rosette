/**
 * Paymob callback routing. The webhook, change-request service, and
 * gift-card service all inspect the transaction's `special_reference` field
 * to decide which domain owns the callback. Each previously parsed the same
 * prefix in isolation. This helper centralizes the format: `kind` is the
 * route tag, `reference` is the local id (purchase id for gift cards,
 * change-request id for deltas), null when the special_reference is empty
 * or unrecognized.
 */
export type PaymobCallbackKind = 'giftcard' | 'change' | 'order';

export type ParsedPaymobSpecialReference = { kind: PaymobCallbackKind; reference: string } | null;

const GIFT_CARD_PREFIX = 'giftcard:';
const CHANGE_PREFIX = 'change:';

export function parsePaymobSpecialReference(raw: string | null | undefined): ParsedPaymobSpecialReference {
  const value = String(raw ?? '').trim();
  if (!value) return null;
  if (value.startsWith(GIFT_CARD_PREFIX)) {
    const reference = value.slice(GIFT_CARD_PREFIX.length);
    return reference ? { kind: 'giftcard', reference } : null;
  }
  if (value.startsWith(CHANGE_PREFIX)) {
    const reference = value.slice(CHANGE_PREFIX.length);
    return reference ? { kind: 'change', reference } : null;
  }
  return { kind: 'order', reference: value };
}
