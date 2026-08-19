type AccountClient = { from: (table: string) => any };

export type CustomerOrderSummary = {
  id: string; displayNumber: string; createdAt: string; totalMinor: number;
  paymentStatus: string; fulfillmentStatus: string;
};

export type CustomerOrderDetail = {
  id: string; displayNumber: string; createdAt: string;
  recipientName: string; deliveryAddress: string; deliveryDate: string; deliveryWindow: string;
  subtotalMinor: number; deliveryFeeMinor: number; totalMinor: number;
  paymentStatus: string; fulfillmentStatus: string;
  items: Array<{ id: string; nameEn: string; nameAr: string; nameFr: string; unitPriceMinor: number; quantity: number; giftMessage: string; addOns: Array<{ id: string; name: string; price: number }> }>;
  events: Array<{ id: string; eventType: string; fromStatus: string | null; toStatus: string | null; createdAt: string }>;
};

export type CustomerCancelRequest = { status: string; reason: string | null; createdAt: string };

export async function getCancelRequestForOrder(client: AccountClient, userId: string, orderId: string): Promise<CustomerCancelRequest | null> {
  const { data } = await client.from('order_cancel_requests')
    .select('status,reason,created_at')
    .eq('order_id', orderId)
    .eq('customer_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  return { status: String(data.status), reason: data.reason ? String(data.reason) : null, createdAt: String(data.created_at) };
}

export async function listCustomerOrders(client: AccountClient, userId: string): Promise<CustomerOrderSummary[]> {
  const { data } = await client.from('orders')
    .select('id,display_number,created_at,total_minor,payment_status,fulfillment_status')
    .eq('customer_id', userId)
    .order('created_at', { ascending: false });
  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id), displayNumber: String(row.display_number), createdAt: String(row.created_at),
    totalMinor: Number(row.total_minor), paymentStatus: String(row.payment_status), fulfillmentStatus: String(row.fulfillment_status),
  }));
}

export type CustomerChangeRequest = { id: string; status: string; reason: string | null; deltaMinor: number | null; createdAt: string };

export async function getChangeRequestForOrder(client: AccountClient, userId: string, orderId: string): Promise<CustomerChangeRequest | null> {
  const { data } = await client.from('order_change_requests')
    .select('id,status,reason,delta_minor,created_at')
    .eq('order_id', orderId)
    .eq('customer_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  return {
    id: String(data.id),
    status: String(data.status),
    reason: data.reason ? String(data.reason) : null,
    deltaMinor: data.delta_minor != null ? Number(data.delta_minor) : null,
    createdAt: String(data.created_at),
  };
}

export async function getCustomerOrder(client: AccountClient, userId: string, orderId: string): Promise<CustomerOrderDetail | null> {
  const { data } = await client.from('orders')
    .select('*,order_items(*),order_events(*)')
    .eq('id', orderId)
    .eq('customer_id', userId)
    .maybeSingle();
  const order = data as Record<string, any> | null;
  if (!order) return null;
  return {
    id: order.id, displayNumber: order.display_number, createdAt: order.created_at,
    recipientName: order.recipient_name, deliveryAddress: order.delivery_address,
    deliveryDate: order.delivery_date, deliveryWindow: order.delivery_window,
    subtotalMinor: order.subtotal_minor, deliveryFeeMinor: order.delivery_fee_minor, totalMinor: order.total_minor,
    paymentStatus: order.payment_status, fulfillmentStatus: order.fulfillment_status,
    items: (order.order_items ?? []).map((item: any) => ({
      id: item.id, nameEn: item.product_name_en ?? '', nameAr: item.product_name_ar ?? '', nameFr: item.product_name_fr ?? '',
      unitPriceMinor: item.unit_price_minor, quantity: item.quantity, giftMessage: String(item.gift_message ?? ''),
      addOns: Array.isArray(item.add_ons) ? item.add_ons.map((addOn: any) => ({ id: String(addOn.id ?? ''), name: String(addOn.name ?? addOn.name_en ?? ''), price: Number(addOn.price ?? addOn.price_minor ?? 0) })) : [],
    })),
    events: (order.order_events ?? []).map((event: any) => ({
      id: event.id, eventType: event.event_type, fromStatus: event.from_status ?? null, toStatus: event.to_status ?? null, createdAt: event.created_at,
    })),
  };
}
