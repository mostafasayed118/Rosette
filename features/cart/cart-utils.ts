import type { AddCartLineInput, Cart } from './types';
import { MAX_LINE_QUANTITY } from './types';

export function addLine(cart: Cart, input: AddCartLineInput): Cart {
  const existing = cart.lines.find((line) => line.id === input.id);
  if (existing) return { lines: cart.lines.map((line) => line.id === input.id ? { ...line, quantity: line.quantity + input.quantity } : line) };
  return { lines: [...cart.lines, { ...input, quantity: Math.max(1, input.quantity) }] };
}

export function updateLineQuantity(cart: Cart, lineId: string, quantity: number): Cart {
  if (quantity <= 0) return removeLine(cart, lineId);
  return { lines: cart.lines.map((line) => line.id === lineId ? { ...line, quantity: Math.min(MAX_LINE_QUANTITY, quantity) } : line) };
}

export function removeLine(cart: Cart, lineId: string): Cart {
  return { lines: cart.lines.filter((line) => line.id !== lineId) };
}
