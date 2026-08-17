export type CartAddOn = { id: string; name: string; price: number };
export type CartLine = { id: string; productSlug: string; productName: string; productNameAr?: string; tone: string; unitPrice: number; quantity: number; variantName?: string; addOns: CartAddOn[]; message: string; deliveryDate: string };
export type Cart = { lines: CartLine[] };
export type OrderTotals = { subtotal: number; deliveryFee: number; total: number };
export type AddCartLineInput = CartLine;
