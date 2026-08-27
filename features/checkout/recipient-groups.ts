import type { CartLine, CartRecipient } from '@/features/cart/types';
import { MAX_GROUPS } from '@/features/cart/recipient-types';
import { deliveryFeeForGroups } from '@/features/cart/pricing';

export function checkoutDeliveryFeeMinor(feeMinor: number, recipients: CartRecipient[]): number {
  return deliveryFeeForGroups(feeMinor, recipients.length);
}

function isComplete(recipient: CartRecipient): boolean {
  return Boolean(recipient.recipientName.trim()) &&
    Boolean(recipient.recipientPhone.trim()) &&
    Boolean(recipient.address.trim()) &&
    Boolean(recipient.deliveryDate);
}

export function validateRecipientGroups(recipients: CartRecipient[], lines: CartLine[]): string | null {
  if (recipients.length > MAX_GROUPS) return 'recipientsTooMany';
  const known = new Set(recipients.map((r) => r.id));
  if (recipients.some((r) => !isComplete(r))) return 'recipientsIncomplete';
  if (recipients.length === 0) return null;
  for (const line of lines) {
    if (!line.recipientId) return 'recipientsUnassigned';
    if (!known.has(line.recipientId)) return 'recipientsUnknown';
  }
  return null;
}
