export type PaymentMethod = 'paymob' | 'demo-card' | 'pay-on-delivery';
export type CheckoutInput = { recipientName: string; recipientPhone: string; address: string; senderName: string; senderEmail: string; deliveryDate: string; deliveryWindow: string; paymentMethod: PaymentMethod; promoCode?: string };
export type CheckoutErrors = Partial<Record<keyof CheckoutInput, string>>;
export type RecipientDetails = { name: string; phone: string };
export type SenderDetails = { name: string; email: string };
export type DeliveryDetails = { address: string; date: string; window: string };
