import type { Destination } from '@/features/destination/types';
import type { CheckoutInput, DeliveryDetails, RecipientDetails, SenderDetails, PaymentMethod } from '@/features/checkout/types';
import type { Cart, CartLine, OrderTotals } from '@/features/cart/types';

export type OrderStatus = 'draft' | 'pending_payment' | 'confirmed' | 'preparing' | 'out_for_delivery' | 'delivered' | 'cancelled' | 'failed';
export type Order = { id: string; displayNumber: string; destination: Destination; items: CartLine[]; recipient: RecipientDetails; sender: SenderDetails; delivery: DeliveryDetails; totals: OrderTotals; payment: { method: PaymentMethod; status: 'pending' | 'authorized' | 'failed' }; status: OrderStatus; createdAt: string };
export type CreateOrderInput = { cart: Cart; destination: Destination; recipient: RecipientDetails; sender: SenderDetails; delivery: DeliveryDetails; paymentMethod: PaymentMethod; simulatePaymentFailure: boolean };
export type OrderError = 'payment_failed' | 'empty_cart';
export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };
export type CheckoutOrderInput = Omit<CreateOrderInput, 'recipient' | 'sender' | 'delivery' | 'paymentMethod'> & { checkout: CheckoutInput };
