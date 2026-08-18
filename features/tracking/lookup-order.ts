import type { FulfillmentStatus, PaymentStatus } from '@/features/commerce/order-state';

export type TrackedOrder = {
  number: string;
  paymentStatus: PaymentStatus;
  fulfillmentStatus: FulfillmentStatus;
  recipientName: string;
  deliveryCityCode: string;
  deliveryDate: string;
  deliveryWindow: string;
  subtotalMinor: number;
  deliveryFeeMinor: number;
  totalMinor: number;
  items: Array<{ nameEn: string; nameAr: string; quantity: number; unitPriceMinor: number; addOns: Array<{ nameEn: string; nameAr: string; priceMinor: number }> }>;
  timeline: Array<{ status: FulfillmentStatus; at: string }>;
};

type LookupClient = { from: (table: string) => any };

type EventRow = { to_status: string | null; created_at: string };
type ItemRow = { product_name_en: string; product_name_ar: string; quantity: number; unit_price_minor: number; add_ons?: Array<{ name_en: string; name_ar: string; price_minor: number }> };

const FULFILLMENT_STATUSES: FulfillmentStatus[] = ['confirmed', 'preparing', 'ready_for_delivery', 'out_for_delivery', 'delivered', 'cancelled'];

export function buildTimeline(events: EventRow[]): Array<{ status: FulfillmentStatus; at: string }> {
  return events
    .filter((event): event is EventRow & { to_status: FulfillmentStatus } => FULFILLMENT_STATUSES.includes(event.to_status as FulfillmentStatus))
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    .map((event) => ({ status: event.to_status, at: event.created_at }));
}

export async function lookupOrder(client: LookupClient, input: { number: string; email: string }): Promise<TrackedOrder | null> {
  try {
    const { data, error } = await client
      .from('orders')
      .select('display_number,customer_email,recipient_name,delivery_city_code,delivery_date,delivery_window,payment_status,fulfillment_status,subtotal_minor,delivery_fee_minor,total_minor,order_items(product_name_en,product_name_ar,quantity,unit_price_minor,add_ons),order_events(to_status,created_at)')
      .eq('display_number', input.number)
      .eq('customer_email', input.email)
      .maybeSingle();
    if (error || !data) return null;
    return {
      number: data.display_number,
      paymentStatus: data.payment_status,
      fulfillmentStatus: data.fulfillment_status,
      recipientName: data.recipient_name,
      deliveryCityCode: data.delivery_city_code,
      deliveryDate: data.delivery_date,
      deliveryWindow: data.delivery_window,
      subtotalMinor: data.subtotal_minor,
      deliveryFeeMinor: data.delivery_fee_minor,
      totalMinor: data.total_minor,
      items: ((data.order_items ?? []) as ItemRow[]).map((item) => ({
        nameEn: item.product_name_en,
        nameAr: item.product_name_ar,
        quantity: item.quantity,
        unitPriceMinor: item.unit_price_minor,
        addOns: (item.add_ons ?? []).map((addOn) => ({ nameEn: addOn.name_en, nameAr: addOn.name_ar, priceMinor: addOn.price_minor })),
      })),
      timeline: buildTimeline((data.order_events ?? []) as EventRow[]),
    };
  } catch {
    return null;
  }
}
