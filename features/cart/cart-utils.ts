import type { AddCartLineInput, Cart, CartLine } from './types';
import type { CartRecipient } from './recipient-types';
import { MAX_GROUPS } from './recipient-types';
import { MAX_LINE_QUANTITY } from './types';

export function addLine(cart: Cart, input: AddCartLineInput): Cart {
  const existing = cart.lines.find((l) => l.id === input.id);
  if (existing) {
    return { ...cart, lines: cart.lines.map((l) => l.id === input.id ? { ...l, quantity: l.quantity + input.quantity } : l) };
  }
  return { ...cart, lines: [...cart.lines, { ...input, quantity: Math.max(1, input.quantity) }] };
}

export function updateLineQuantity(cart: Cart, lineId: string, quantity: number): Cart {
  if (quantity <= 0) return removeLine(cart, lineId);
  return { ...cart, lines: cart.lines.map((l) => l.id === lineId ? { ...l, quantity: Math.min(MAX_LINE_QUANTITY, quantity) } : l) };
}

export function removeLine(cart: Cart, lineId: string): Cart {
  return { ...cart, lines: cart.lines.filter((l) => l.id !== lineId) };
}

export function isMultiRecipient(cart: Cart): boolean {
  return (cart.recipients?.length ?? 0) > 0;
}

export function addRecipient(cart: Cart, recipient: CartRecipient): Cart {
  if (cart.recipients.length >= MAX_GROUPS) return cart;
  return { ...cart, recipients: [...cart.recipients, recipient] };
}

export function updateRecipient(cart: Cart, id: string, patch: Partial<Omit<CartRecipient, 'id'>>): Cart {
  const recipient = cart.recipients.find((r) => r.id === id);
  if (!recipient) return cart;
  const next = { ...recipient, ...patch };
  return {
    ...cart,
    recipients: cart.recipients.map((r) => (r.id === id ? next : r)),
    // Keep this group's assigned lines' deliveryDate in sync with the group date.
    lines: cart.lines.map((l) => (l.recipientId === id ? { ...l, deliveryDate: next.deliveryDate } : l)),
  };
}

export function removeRecipient(cart: Cart, id: string): Cart {
  return {
    ...cart,
    recipients: cart.recipients.filter((r) => r.id !== id),
    lines: cart.lines.map((l) => (l.recipientId === id ? { ...l, recipientId: undefined } : l)),
  };
}

export function assignLineToRecipient(cart: Cart, lineId: string, recipientId: string | undefined): Cart | null {
  const line = cart.lines.find((l) => l.id === lineId);
  if (!line) return null;
  const recipient = recipientId ? (cart.recipients.find((r) => r.id === recipientId) ?? null) : null;
  if (recipientId && !recipient) return null;
  return {
    ...cart,
    lines: cart.lines.map((l) => (l.id === lineId ? { ...l, recipientId, deliveryDate: recipient ? recipient.deliveryDate : l.deliveryDate } : l)),
  };
}

export const UNASSIGNED_KEY = '__unassigned__';

export function groupLinesByRecipient(lines: CartLine[]): Map<string, CartLine[]> {
  const map = new Map<string, CartLine[]>();
  for (const line of lines) {
    const key = line.recipientId ?? UNASSIGNED_KEY;
    const bucket = map.get(key) ?? [];
    bucket.push(line);
    map.set(key, bucket);
  }
  return map;
}