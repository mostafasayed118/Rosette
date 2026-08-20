export type PaymentCustomer = { name: string; email: string; phone: string };
export type CreatePaymentInput = { amountMinor: number; orderReference: string; specialReference?: string; integrationId: number; customer: PaymentCustomer; notificationUrl: string; redirectionUrl: string };
export type PaymobIntentionResponse = { id: string; client_secret: string; intention_order_id?: number; special_reference?: string };
export type PaymentCallbackInput = { orderReference: string; providerReference: string; amountMinor: number; success: boolean; idempotencyKey: string };
export type PaymentTransitionResult = { accepted: boolean; paymentStatus: 'paid' | 'payment_failed' | 'pending' };
export interface PaymentGateway { createCheckout(input: CreatePaymentInput): Promise<{ providerReference: string; checkoutUrl: string }>; }
