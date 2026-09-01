import { MAX_LINE_QUANTITY } from '@/features/cart/types';
import { checkDeliveryDate } from '@/features/delivery/eligibility';

export type OrderRequestError =
  | 'empty_cart'
  | 'client_total_not_allowed'
  | 'invalid_quantity'
  | 'undeliverable_date';

/**
 * Validates the shape of an order request. Delivery-date legality is checked
 * here as well as in the client forms — the client check is a courtesy, this
 * one is the guarantee.
 */
export function validateOrderRequest(input: {
  cart?: unknown;
  total?: unknown;
  checkout?: unknown;
  recipients?: unknown;
}) {
  if ('total' in input) return { ok: false as const, error: 'client_total_not_allowed' as const };
  const cart = input.cart && typeof input.cart === 'object' ? input.cart as { lines?: unknown[] } : null;
  const lines = cart?.lines;
  if (!lines?.length) return { ok: false as const, error: 'empty_cart' as const };

  // Single-recipient orders carry the date on `checkout`; multi-recipient
  // orders carry one date per recipient instead.
  const datesToCheck: unknown[] = [];
  const checkout = input.checkout && typeof input.checkout === 'object' ? input.checkout as { deliveryDate?: unknown } : null;
  const checkoutDate = checkout?.deliveryDate;
  if (checkoutDate !== undefined) datesToCheck.push(checkoutDate);
  const recipients = Array.isArray(input.recipients) ? input.recipients : [];
  for (const recipient of recipients) {
    const date = (recipient as { deliveryDate?: unknown } | null)?.deliveryDate;
    if (date !== undefined) datesToCheck.push(date);
  }
  for (const date of datesToCheck) {
    if (!checkDeliveryDate(date).eligible) return { ok: false as const, error: 'undeliverable_date' as const };
  }

  for (const line of lines) {
    if (!line || typeof line !== 'object') return { ok: false as const, error: 'invalid_quantity' as const };
    const quantity = (line as { quantity?: unknown }).quantity;
    if (!Number.isInteger(quantity) || Number(quantity) < 1 || Number(quantity) > MAX_LINE_QUANTITY) {
      return { ok: false as const, error: 'invalid_quantity' as const };
    }
  }
  return { ok: true as const };
}
