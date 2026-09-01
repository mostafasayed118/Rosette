import { buildOrderListQuery, type OrderListParams } from '../order-list-query';
import { getAdminClient, type AdminClient } from './client';

export type AdminOrderRow = {
  id: string;
  displayNumber: string;
  customerEmail: string;
  recipientName: string;
  totalMinor: number;
  paymentStatus: string;
  fulfillmentStatus: string;
  createdAt: string;
};

export type AdminOrderDetail = {
  id: string;
  displayNumber: string;
  customerEmail: string;
  recipientName: string;
  recipientPhone: string;
  deliveryCityCode: string;
  deliveryDate: string;
  deliveryWindow: string;
  deliveryAddress: string;
  totalMinor: number;
  paymentStatus: string;
  fulfillmentStatus: string;
  items: Array<{ id: string; productName: string; unitPriceMinor: number; quantity: number }>;
  payments: Array<{ id: string; provider: string; providerReference: string | null; amountMinor: number; status: string }>;
  events: Array<{ id: string; eventType: string; fromStatus: string | null; toStatus: string | null; createdAt: string }>;
  deliveries: Array<{ id: string; type: string; recipient: string; status: string; attempts: number; lastError: string | null; createdAt: string; sentAt: string | null }>;
  cancelRequests: Array<{ id: string; status: string; reason: string | null; createdAt: string }>;
  groups: Array<{ id: string; position: number; recipientName: string; recipientPhone: string; deliveryAddress: string; deliveryDate: string; deliveryWindow: string; deliveryFeeMinor: number; fulfillmentStatus: string }>;
};

const ORDER_LIST_SELECT = 'id,display_number,customer_email,recipient_name,total_minor,payment_status,fulfillment_status,created_at';
const ORDER_DETAIL_SELECT =
  'id,display_number,customer_email,recipient_name,recipient_phone,delivery_city_code,delivery_date,delivery_window,delivery_address,total_minor,payment_status,fulfillment_status,order_items(id,product_name_en,unit_price_minor,quantity),payments(id,provider,provider_reference,amount_minor,status),order_events(id,event_type,from_status,to_status,created_at),notification_deliveries(id,type,recipient,status,attempts,last_error,created_at,sent_at),order_cancel_requests(id,status,reason,created_at),order_delivery_groups(id,position,recipient_name,recipient_phone,delivery_address,delivery_date,delivery_window,delivery_fee_minor,fulfillment_status)';

function escapeIlike(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_');
}

function escapeOrValue(value: string): string {
  return escapeIlike(value).replaceAll(',', '\\,').replaceAll('"', '\\"').replaceAll('(', '\\(').replaceAll(')', '\\)');
}

function sanitizeSearch(value: string): string {
  return value.trim().slice(0, 80).replace(/\s+/g, ' ');
}

/** Bounded (limit 100), server-filtered order list for the admin queue. */
export async function listAdminOrders(
  params: OrderListParams,
  client: AdminClient = getAdminClient(),
): Promise<AdminOrderRow[]> {
  const constraints = buildOrderListQuery(params);
  let query = client.from('orders').select(ORDER_LIST_SELECT).order('created_at', { ascending: false }).limit(100);
  if (constraints.search) {
    const safe = escapeOrValue(sanitizeSearch(constraints.search));
    query = query.or(`display_number.ilike.%${safe}%,customer_email.ilike.%${safe}%,customer_phone.ilike.%${safe}%`);
  }
  if (constraints.paymentStatus) query = query.eq('payment_status', constraints.paymentStatus);
  if (constraints.fulfillmentStatus) query = query.eq('fulfillment_status', constraints.fulfillmentStatus);
  const { data, error } = await query;
  if (error) throw new Error(`Admin order list query failed: ${error.message}`);
  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id),
    displayNumber: String(row.display_number ?? ''),
    customerEmail: String(row.customer_email ?? ''),
    recipientName: String(row.recipient_name ?? ''),
    totalMinor: Number(row.total_minor ?? 0),
    paymentStatus: String(row.payment_status ?? ''),
    fulfillmentStatus: String(row.fulfillment_status ?? ''),
    createdAt: String(row.created_at ?? ''),
  }));
}

type OrderDetailRow = Record<string, unknown> & {
  order_items?: Array<Record<string, unknown>> | null;
  payments?: Array<Record<string, unknown>> | null;
  order_events?: Array<Record<string, unknown>> | null;
  notification_deliveries?: Array<Record<string, unknown>> | null;
  order_cancel_requests?: Array<Record<string, unknown>> | null;
  order_delivery_groups?: Array<Record<string, unknown>> | null;
};

function asRows(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? (value as Array<Record<string, unknown>>) : [];
}

function str(value: unknown): string {
  return value == null ? '' : String(value);
}

function num(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Full order aggregate for the detail page, or `null` when the id is unknown. */
export async function getAdminOrderDetail(
  orderId: string,
  client: AdminClient = getAdminClient(),
): Promise<AdminOrderDetail | null> {
  const { data, error } = await client.from('orders').select(ORDER_DETAIL_SELECT).eq('id', orderId).maybeSingle();
  if (error) throw new Error(`Admin order detail query failed: ${error.message}`);
  if (!data) return null;
  const row = data as OrderDetailRow;
  return {
    id: str(row.id),
    displayNumber: str(row.display_number),
    customerEmail: str(row.customer_email),
    recipientName: str(row.recipient_name),
    recipientPhone: str(row.recipient_phone),
    deliveryCityCode: str(row.delivery_city_code),
    deliveryDate: str(row.delivery_date),
    deliveryWindow: str(row.delivery_window),
    deliveryAddress: str(row.delivery_address),
    totalMinor: num(row.total_minor),
    paymentStatus: str(row.payment_status),
    fulfillmentStatus: str(row.fulfillment_status),
    items: asRows(row.order_items).map((item) => ({
      id: str(item.id),
      productName: str(item.product_name_en),
      unitPriceMinor: num(item.unit_price_minor),
      quantity: num(item.quantity),
    })),
    payments: asRows(row.payments).map((payment) => ({
      id: str(payment.id),
      provider: str(payment.provider),
      providerReference: payment.provider_reference == null ? null : str(payment.provider_reference),
      amountMinor: num(payment.amount_minor),
      status: str(payment.status),
    })),
    events: asRows(row.order_events).map((event) => ({
      id: str(event.id),
      eventType: str(event.event_type),
      fromStatus: event.from_status == null ? null : str(event.from_status),
      toStatus: event.to_status == null ? null : str(event.to_status),
      createdAt: str(event.created_at),
    })),
    deliveries: asRows(row.notification_deliveries)
      .map((delivery) => ({
        id: str(delivery.id),
        type: str(delivery.type),
        recipient: str(delivery.recipient),
        status: str(delivery.status),
        attempts: num(delivery.attempts),
        lastError: delivery.last_error == null ? null : str(delivery.last_error),
        createdAt: str(delivery.created_at),
        sentAt: delivery.sent_at == null ? null : str(delivery.sent_at),
      }))
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0)),
    cancelRequests: asRows(row.order_cancel_requests)
      .map((request) => ({
        id: str(request.id),
        status: str(request.status),
        reason: request.reason == null ? null : str(request.reason),
        createdAt: str(request.created_at),
      }))
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)),
    groups: asRows(row.order_delivery_groups)
      .map((group) => ({
        id: str(group.id),
        position: num(group.position),
        recipientName: str(group.recipient_name),
        recipientPhone: str(group.recipient_phone),
        deliveryAddress: str(group.delivery_address),
        deliveryDate: str(group.delivery_date),
        deliveryWindow: str(group.delivery_window),
        deliveryFeeMinor: num(group.delivery_fee_minor),
        fulfillmentStatus: str(group.fulfillment_status),
      }))
      .sort((a, b) => a.position - b.position),
  };
}
