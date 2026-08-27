import type { FulfillmentStatus } from '@/features/commerce/order-state';

export type DeliveryGroupItem = { unitPriceMinor: number; quantity: number };

export type DeliveryGroup = {
  id: string | null;
  position: number;
  recipientName: string;
  recipientPhone: string;
  deliveryAddress: string;
  deliveryDate: string;
  deliveryWindow: string;
  deliveryFeeMinor: number;
  fulfillmentStatus: FulfillmentStatus;
  publicToken: string | null;
  cancelledAt: string | null;
  items: DeliveryGroupItem[];
};

const ORDERED: FulfillmentStatus[] = ['confirmed', 'preparing', 'ready_for_delivery', 'out_for_delivery', 'delivered'];

export function deriveOrderStatus(groups: Array<Pick<DeliveryGroup, 'fulfillmentStatus'>>): FulfillmentStatus {
  const active = groups.filter((g) => g.fulfillmentStatus !== 'cancelled');
  if (active.length === 0) return groups.length ? 'cancelled' : 'confirmed';
  if (active.every((g) => g.fulfillmentStatus === 'delivered')) return 'delivered';
  let minimum = ORDERED.length;
  for (const g of active) {
    const rank = ORDERED.indexOf(g.fulfillmentStatus);
    if (rank >= 0 && rank < minimum) minimum = rank;
  }
  return ORDERED[Math.min(minimum, ORDERED.length - 1)] ?? 'confirmed';
}

type GroupOrderColumns = Partial<Record<
  'recipient_name' | 'recipient_phone' | 'delivery_address' | 'delivery_date' | 'delivery_window' | 'delivery_fee_minor' | 'fulfillment_status',
  unknown
>>;

export function normalizeGroups(order: GroupOrderColumns, groups: DeliveryGroup[]): DeliveryGroup[] {
  if (groups.length > 0) return groups;
  return [{
    id: null,
    position: 0,
    recipientName: String(order.recipient_name ?? ''),
    recipientPhone: String(order.recipient_phone ?? ''),
    deliveryAddress: String(order.delivery_address ?? ''),
    deliveryDate: String(order.delivery_date ?? ''),
    deliveryWindow: String(order.delivery_window ?? ''),
    deliveryFeeMinor: Number(order.delivery_fee_minor ?? 0),
    fulfillmentStatus: (order.fulfillment_status as FulfillmentStatus) ?? 'confirmed',
    publicToken: null,
    cancelledAt: null,
    items: [],
  }];
}

type GroupRow = {
  id: string;
  position: number;
  recipient_name: string;
  recipient_phone: string;
  delivery_address: string;
  delivery_date: string;
  delivery_window: string;
  delivery_fee_minor: number;
  fulfillment_status: string;
  public_token: string;
  cancelled_at: string | null;
};

function toDeliveryGroup(row: GroupRow): DeliveryGroup {
  return {
    id: row.id,
    position: row.position,
    recipientName: row.recipient_name,
    recipientPhone: row.recipient_phone,
    deliveryAddress: row.delivery_address,
    deliveryDate: row.delivery_date,
    deliveryWindow: row.delivery_window,
    deliveryFeeMinor: row.delivery_fee_minor,
    fulfillmentStatus: row.fulfillment_status as FulfillmentStatus,
    publicToken: row.public_token,
    cancelledAt: row.cancelled_at,
    items: [],
  };
}

type GroupsClient = { from: (table: string) => any };

export async function fetchOrderDeliveryGroups(client: GroupsClient, orderId: string): Promise<DeliveryGroup[] | null> {
  try {
    const { data, error } = await client
      .from('order_delivery_groups')
      .select('id,position,recipient_name,recipient_phone,delivery_address,delivery_date,delivery_window,delivery_fee_minor,fulfillment_status,public_token,cancelled_at')
      .eq('order_id', orderId)
      .order('position', { ascending: true });
    if (error) return null;
    return ((data ?? []) as GroupRow[]).map(toDeliveryGroup);
  } catch {
    return null;
  }
}

export async function orderHasDeliveryGroups(client: GroupsClient, orderId: string): Promise<boolean> {
  try {
    const { data } = await client
      .from('order_delivery_groups')
      .select('id')
      .eq('order_id', orderId)
      .limit(1);
    return (data?.length ?? 0) > 0;
  } catch {
    return false;
  }
}
