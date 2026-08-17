import { calculateCartTotals } from '@/features/cart/pricing';
import type { Order, CreateOrderInput, Result, OrderError } from './types';

const STORAGE_KEY = 'rosette.orders.v1';
let sequence = 0;

function readOrders(): Order[] { if (typeof window === 'undefined') return []; try { const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '[]') as unknown; return Array.isArray(parsed) ? parsed as Order[] : []; } catch { return []; } }
function writeOrders(orders: Order[]) { if (typeof window !== 'undefined') window.localStorage.setItem(STORAGE_KEY, JSON.stringify(orders)); }

export function createLocalOrder(input: CreateOrderInput): Result<Order, OrderError> {
  if (!input.cart.lines.length) return { ok: false, error: 'empty_cart' };
  if (input.simulatePaymentFailure) return { ok: false, error: 'payment_failed' };
  sequence += 1;
  const id = `order-${Date.now()}-${sequence}`;
  const order: Order = { id, displayNumber: `RO-${String(sequence).padStart(4, '0')}`, destination: input.destination, items: input.cart.lines, recipient: input.recipient, sender: input.sender, delivery: input.delivery, totals: calculateCartTotals(input.cart.lines, 1500), payment: { method: input.paymentMethod, status: 'authorized' }, status: 'confirmed', createdAt: new Date().toISOString() };
  writeOrders([...readOrders(), order]);
  return { ok: true, value: order };
}

export function getLocalOrder(id: string): Order | null { return readOrders().find((order) => order.id === id) ?? null; }
