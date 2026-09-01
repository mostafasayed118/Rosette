import type { Frequency } from './types';
import { addInterval, datesFrom } from './schedule';

type Client = { from: (table: string) => any; rpc?: (name: string, args: Record<string, unknown>) => any };

type SubListRow = {
  id: string; status: string; frequency: string; bundle_size: number; price_minor: number;
  first_delivery_date: string; subscription_plans?: { name_en?: string } | null;
};
type DeliveryStatusRow = { status: string };
type DeliveryDetailRow = { id: string; position: number; scheduled_date: string; status: string; order_id: string | null };
type RemainingRow = { id: string };

export type DeliveryRow = { id: string; position: number; scheduledDate: string; status: 'scheduled' | 'ordered' | 'cancelled'; orderId: string | null };

export async function listCustomerSubscriptions(client: Client, customerId: string) {
  const { data } = await client.from('subscriptions')
    .select('id,status,frequency,bundle_size,price_minor,first_delivery_date,subscription_plans(name_en)')
    .eq('customer_id', customerId).order('created_at', { ascending: false });
  const rows = (data ?? []) as SubListRow[];
  const counts = await Promise.all(rows.map(async (row) => {
    const { data: d } = await client.from('subscription_deliveries').select('status').eq('subscription_id', row.id);
    return ((d ?? []) as DeliveryStatusRow[]).filter((x) => x.status === 'ordered').length;
  }));
  return rows.map((row, i) => ({ id: String(row.id), planNameEn: String(row.subscription_plans?.name_en ?? ''), status: row.status, frequency: row.frequency, bundleSize: Number(row.bundle_size), priceMinor: Number(row.price_minor), firstDeliveryDate: String(row.first_delivery_date), orderedCount: counts[i] ?? 0 }));
}

export async function getSubscriptionDetail(client: Client, subscriptionId: string) {
  const { data } = await client.from('subscriptions')
    .select('*,subscription_plans(name_en,name_ar,name_fr),products(id,name_en,name_ar,name_fr)')
    .eq('id', subscriptionId).maybeSingle();
  if (!data) return null;
  const { data: deliveries } = await client.from('subscription_deliveries').select('id,position,scheduled_date,status,order_id').eq('subscription_id', subscriptionId).order('position', { ascending: true });
  return {
    id: String(data.id), customerId: String(data.customer_id), planId: String(data.plan_id),
    productId: String(data.product_id), variantId: String(data.variant_id), status: data.status,
    frequency: data.frequency, bundleSize: Number(data.bundle_size), priceMinor: Number(data.price_minor),
    locale: data.locale, recipientName: String(data.recipient_name), recipientPhone: String(data.recipient_phone),
    deliveryAddress: String(data.delivery_address), deliveryCityCode: String(data.delivery_city_code),
    deliveryWindow: String(data.delivery_window), giftMessage: String(data.gift_message ?? ''),
    firstDeliveryDate: String(data.first_delivery_date), checkoutOrderId: data.checkout_order_id ? String(data.checkout_order_id) : null,
    renewalNudgeSentAt: data.renewal_nudge_sent_at ?? null, renewalPromoCode: data.renewal_promo_code ?? null,
    cancelledAt: data.cancelled_at ?? null, completedAt: data.completed_at ?? null, createdAt: String(data.created_at),
    planNameEn: String(data.subscription_plans?.name_en ?? ''), planNameAr: String(data.subscription_plans?.name_ar ?? ''), planNameFr: String(data.subscription_plans?.name_fr ?? ''),
    deliveries: ((deliveries ?? []) as DeliveryDetailRow[]).map((d) => ({ id: String(d.id), position: Number(d.position), scheduledDate: String(d.scheduled_date), status: d.status, orderId: d.order_id ? String(d.order_id) : null })),
  };
}

export async function pauseSubscription(client: Client, subscriptionId: string, customerId: string): Promise<boolean> {
  const { data } = await client.from('subscriptions').select('id').eq('id', subscriptionId).eq('customer_id', customerId).maybeSingle();
  if (!data) return false;
  const { data: ok, error } = await client.rpc?.('pause_subscription', { p_subscription_id: subscriptionId }) ?? { data: false, error: true };
  return !error && ok === true;
}

export async function resumeSubscription(client: Client, subscriptionId: string, customerId: string, nextDeliveryDate: string): Promise<boolean> {
  const { data: owned } = await client.from('subscriptions').select('id,frequency').eq('id', subscriptionId).eq('customer_id', customerId).maybeSingle();
  if (!owned) return false;
  const { data: remaining } = await client.from('subscription_deliveries').select('id').eq('subscription_id', subscriptionId).eq('status', 'scheduled');
  const dates = datesFrom(nextDeliveryDate, owned.frequency as Frequency, Math.max(((remaining ?? []) as RemainingRow[]).length, 1));
  const { data: ok, error } = await client.rpc?.('resume_subscription', { p_subscription_id: subscriptionId, p_dates: dates }) ?? { data: false, error: true };
  return !error && ok === true;
}

export async function rescheduleDeliveries(client: Client, subscriptionId: string, customerId: string, deliveryId: string, newDate: string, isSkip: boolean): Promise<boolean> {
  const { data: owned } = await client.from('subscriptions').select('id,frequency').eq('id', subscriptionId).eq('customer_id', customerId).maybeSingle();
  if (!owned) return false;
  const { data: deliveries } = await client.from('subscription_deliveries').select('id,position,status,scheduled_date').eq('subscription_id', subscriptionId).eq('status', 'scheduled').order('position', { ascending: true });
  const list = (deliveries ?? []) as Array<{ id: string; position: number; scheduled_date: string }>;
  const targetIdx = list.findIndex((d) => d.id === deliveryId);
  if (targetIdx === -1) return false;
  const base = isSkip ? addInterval(list[targetIdx]!.scheduled_date, owned.frequency as Frequency) : newDate;
  const count = list.length - targetIdx;
  const dates = datesFrom(base, owned.frequency as Frequency, count);
  const { data: ok, error } = await client.rpc?.('reDateSubsequentDeliveries', { p_subscription_id: subscriptionId, p_from_position: list[targetIdx]!.position, p_dates: dates }) ?? { data: false, error: true };
  return !error && ok === true;
}

export const skipDelivery = (client: Client, id: string, customerId: string, deliveryId: string) => rescheduleDeliveries(client, id, customerId, deliveryId, '', true);
