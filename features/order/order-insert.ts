export function buildOrderInsertRow(params: {
  number: string; publicToken: string; customerId?: string | null;
  customerEmail: string; customerPhone: string; recipientName: string; recipientPhone: string;
  deliveryAddress: string; deliveryCityCode: string; deliveryDate: string; deliveryWindow: string;
  locale: string; subtotalMinor: number; deliveryFeeMinor: number; discountMinor: number;
  promoCode: string | null; totalMinor: number;
}): Record<string, unknown> {
  return {
    display_number: params.number,
    public_token: params.publicToken,
    customer_id: params.customerId ?? null,
    customer_email: params.customerEmail.trim(),
    customer_phone: params.customerPhone.trim(),
    recipient_name: params.recipientName.trim(),
    recipient_phone: params.recipientPhone.trim(),
    delivery_address: params.deliveryAddress.trim(),
    delivery_city_code: params.deliveryCityCode,
    delivery_date: params.deliveryDate,
    delivery_window: params.deliveryWindow,
    locale: params.locale,
    subtotal_minor: params.subtotalMinor,
    delivery_fee_minor: params.deliveryFeeMinor,
    discount_minor: params.discountMinor,
    promo_code: params.promoCode,
    total_minor: params.totalMinor,
    payment_status: 'pending',
    fulfillment_status: 'confirmed',
  };
}
