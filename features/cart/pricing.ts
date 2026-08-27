import type { CartLine, OrderTotals } from './types';

export function calculateLineTotal(line: CartLine) {
  const addOns = line.addOns.reduce((sum, addOn) => sum + addOn.price, 0);
  return (line.unitPrice + addOns) * line.quantity;
}

export function calculateCartTotals(lines: CartLine[], deliveryFee: number): OrderTotals {
  const subtotal = lines.reduce((sum, line) => sum + calculateLineTotal(line), 0);
  return { subtotal, deliveryFee, total: subtotal + deliveryFee };
}

export function deliveryFeeForGroups(feeMinor: number, groupCount: number): number {
  return feeMinor * Math.max(1, groupCount);
}

export type GroupedTotals = { byGroup: Map<string, { subtotalMinor: number; feeMinor: number }>; overallSubtotalMinor: number };

export function calculateGroupTotals(lines: CartLine[], feeMinor: number, keys: string[]): GroupedTotals {
  const byGroup = new Map<string, { subtotalMinor: number; feeMinor: number }>();
  let overallSubtotalMinor = 0;
  for (const key of keys) byGroup.set(key, { subtotalMinor: 0, feeMinor });
  for (const line of lines) {
    const key = line.recipientId ?? '__unassigned__';
    const subtotal = calculateLineTotal(line);
    overallSubtotalMinor += subtotal;
    const bucket = byGroup.get(key);
    if (bucket) bucket.subtotalMinor += subtotal;
  }
  return { byGroup, overallSubtotalMinor };
}