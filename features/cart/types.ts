import type { CartRecipient } from './recipient-types';

export type { CartRecipient } from './recipient-types';

export type CartAddOn = { id: string; name: string; price: number };
export type CartLine = { id: string; productSlug: string; productName: string; productNameAr?: string; productNameFr?: string; tone: string; imageUrl?: string | null; unitPrice: number; quantity: number; variantId?: string; variantName?: string; addOns: CartAddOn[]; message: string; deliveryDate: string; recipientId?: string };
export type Cart = { version: 2; lines: CartLine[]; recipients: CartRecipient[] };
export type OrderTotals = { subtotal: number; deliveryFee: number; discountMinor?: number; total: number };
export type AddCartLineInput = CartLine;

/**
 * Maximum quantity the cart will accept on a single line. The cap exists to
 * prevent accidental 1000-item adds and to bound server-side cost on a single
 * checkout. UI surfaces this as a soft cap on the product detail.
 */
export const MAX_LINE_QUANTITY = 20;
