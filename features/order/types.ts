import type { Destination } from '@/features/destination/types';
import type { CheckoutInput, DeliveryDetails, RecipientDetails, SenderDetails, PaymentMethod } from '@/features/checkout/types';
import type { Cart, CartLine, OrderTotals } from '@/features/cart/types';

export type OrderStatus = 'draft' | 'pending_payment' | 'confirmed' | 'preparing' | 'out_for_delivery' | 'delivered' | 'cancelled' | 'failed';
export type Order = { id: string; displayNumber: string; destination: Destination; items: CartLine[]; recipient: RecipientDetails; sender: SenderDetails; delivery: DeliveryDetails; totals: OrderTotals; payment: { method: PaymentMethod; status: 'pending' | 'authorized' | 'failed' }; status: OrderStatus; createdAt: string };
export type CreateOrderInput = { cart: Cart; destination: Destination; recipient: RecipientDetails; sender: SenderDetails; delivery: DeliveryDetails; paymentMethod: PaymentMethod; simulatePaymentFailure: boolean };
export type OrderError = 'payment_failed' | 'empty_cart';
export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };
export type CheckoutOrderInput = Omit<CreateOrderInput, 'recipient' | 'sender' | 'delivery' | 'paymentMethod'> & { checkout: CheckoutInput };

export type CreatePendingOrderInput = { cart: Cart; destination: Destination; checkout: CheckoutInput; locale: 'en' | 'ar' | 'fr'; customerId?: string | null };
export type PendingOrder = { id: string; displayNumber: string; totalMinor: number; subtotalMinor: number; deliveryFeeMinor: number; discountMinor: number; giftCardMinor?: number; giftCardId?: string | null; giftCardHoldId?: string | null; giftCardCodeLast4?: string | null; paymentStatus: 'pending'; fulfillmentStatus: 'confirmed'; publicToken?: string; checkoutUrl?: string };
export type OrderVerification = { phone?: string; email?: string; publicToken?: string };
export type OrderCreateError = 'empty_cart' | 'unavailable' | 'invalid' | 'invalid_promo' | 'invalid_gift_card';
export interface OrderRepository {
  createPending(input: CreatePendingOrderInput): Promise<Result<PendingOrder, OrderCreateError>>;
  getPublicOrder(id: string, verification: OrderVerification): Promise<Order | null>;
}

/**
 * Canonical column list for the orders table, used by every consumer that
 * reads an order row. Adding a column here is a contract change — every
 * downstream feature that consumes an order row will see it.
 *
 * The change-request and cancellation flows need payment_status, customer_id,
 * gift_card_* (to decide whether a refund is owed), and the address fields
 * (to recompute the delivery fee on a change). The order_items sub-select is
 * only needed for the change-request flow; consumers that do not need items
 * can use {@link orderSelectNoItems}.
 */
export const orderSelect = 'id,display_number,fulfillment_status,payment_status,customer_id,customer_email,locale,total_minor,subtotal_minor,delivery_fee_minor,discount_minor,public_token,recipient_name,recipient_phone,delivery_address,delivery_date,delivery_window,gift_card_id,gift_card_minor,gift_card_hold_id';

export const orderSelectNoItems = orderSelect;

export const orderSelectWithItems = `${orderSelect},order_items(id,unit_price_minor,quantity,gift_message)`;

export const orderSelectWithItemsAndPayments = `${orderSelectWithItems},payments(id,provider_reference,amount_minor,status)`;
