import type { CartLine, OrderTotals } from './types';

export function calculateLineTotal(line: CartLine) {
  const addOns = line.addOns.reduce((sum, addOn) => sum + addOn.price, 0);
  return (line.unitPrice + addOns) * line.quantity;
}

export function calculateCartTotals(lines: CartLine[], deliveryFee: number): OrderTotals {
  const subtotal = lines.reduce((sum, line) => sum + calculateLineTotal(line), 0);
  return { subtotal, deliveryFee, total: subtotal + deliveryFee };
}
