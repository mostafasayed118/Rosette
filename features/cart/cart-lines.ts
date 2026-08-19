import type { CartLine } from './types';

function isCartLine(value: unknown): value is CartLine {
  if (typeof value !== 'object' || value === null) return false;
  const line = value as Record<string, unknown>;
  return (
    typeof line.id === 'string' &&
    typeof line.productSlug === 'string' && line.productSlug.length > 0 &&
    typeof line.quantity === 'number' && Number.isInteger(line.quantity) && line.quantity > 0 &&
    typeof line.unitPrice === 'number' && Number.isFinite(line.unitPrice) && line.unitPrice >= 0 &&
    Array.isArray(line.addOns)
  );
}

export function validateCartLines(value: unknown, max = 20): CartLine[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > max) return null;
  if (!value.every(isCartLine)) return null;
  return value as CartLine[];
}
