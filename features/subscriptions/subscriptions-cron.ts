import type { Frequency } from './types';
import { sendSubscriptionEmail } from './email';

type CronClient = { from: (table: string) => any; rpc: (name: string, args: Record<string, unknown>) => any };

type CronSubRow = {
  id: string; status: string; frequency: string; bundle_size: number; locale: string;
  renewal_nudge_sent_at: string | null;
  subscription_plans?: { name_en?: string } | null;
  profiles?: { email?: string } | null;
};
type CronDeliveryRow = { id: string; status: string; scheduled_date: string };
type PendingRow = { id: string; checkout_order_id: string | null };

export type SubscriptionCronSummary = { materialized: number; nudgesSent: number; completed: number; expired: number; failed: number };
export const MATERIALIZE_HORIZON_DAYS = 2;
export const SUBSCRIPTION_BATCH_SIZE = 200;
export const DELIVERY_BATCH_SIZE = 100;

function dateRef(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}
function unshift(ref: string, days: number): string {
  const [y = 0, m = 1, d = 1] = ref.split('-').map(Number);
  return dateRef(new Date(Date.UTC(y, m - 1, d) + days * 86_400_000));
}

function bounded(query: any, limit: number, order?: { column: string; ascending: boolean }): any {
  const ordered = order && typeof query.order === 'function' ? query.order(order.column, { ascending: order.ascending }) : query;
  return typeof ordered.limit === 'function' ? ordered.limit(limit) : ordered;
}

export async function runSubscriptionsCron(
  client: CronClient,
  deps: { today?: Date; origin: string; send?: (input: { type: string; to: string; locale: 'en' | 'ar' | 'fr'; planName: string; code?: string; plansUrl?: string }) => Promise<void> },
): Promise<SubscriptionCronSummary> {
  const s: SubscriptionCronSummary = { materialized: 0, nudgesSent: 0, completed: 0, expired: 0, failed: 0 };
  const today = dateRef(deps.today ?? new Date());
  const send = deps.send ?? (async (input: Parameters<typeof sendSubscriptionEmail>[0]) => { await sendSubscriptionEmail(input); });
  const c = client;

  // Pass 1 — materialize
  const subscriptionsQuery = c.from('subscriptions')
    .select('id,status,frequency,bundle_size,locale,renewal_nudge_sent_at,subscription_plans(name_en),profiles(email)')
    .in('status', ['active']);
  const { data: subs } = await bounded(subscriptionsQuery, SUBSCRIPTION_BATCH_SIZE, { column: 'created_at', ascending: true });
  for (const sub of (subs ?? []) as CronSubRow[]) {
    const deliveriesQuery = c.from('subscription_deliveries')
      .select('id,status,scheduled_date').eq('subscription_id', sub.id).eq('status', 'scheduled')
      .lte('scheduled_date', unshift(today, MATERIALIZE_HORIZON_DAYS));
    const { data: due } = await bounded(deliveriesQuery, DELIVERY_BATCH_SIZE, { column: 'scheduled_date', ascending: true });
    for (const delivery of (due ?? []) as CronDeliveryRow[]) {
      const { data, error } = await c.rpc('materialize_subscription_delivery', { p_subscription_id: sub.id, p_delivery_id: delivery.id });
      if (!error && data?.status === 'ordered') s.materialized += 1; else s.failed += 1;
    }
  }

  // Pass 2 — nudge at 1 remaining / complete when empty
  for (const sub of (subs ?? []) as CronSubRow[]) {
    const remainingQuery = c.from('subscription_deliveries')
      .select('id,status')
      .eq('subscription_id', sub.id)
      .eq('status', 'scheduled');
    const { data: remaining } = await bounded(remainingQuery, 2);
    const count = ((remaining ?? []) as { id: string }[]).length;
    const planName = String(sub.subscription_plans?.name_en ?? '');
    const to = String(sub.profiles?.email ?? '');
    const locale = (sub.locale === 'ar' || sub.locale === 'fr' ? sub.locale : 'en') as 'en' | 'ar' | 'fr';
    if (count === 0 && sub.status === 'active' && !sub.renewal_nudge_sent_at) {
      const { error: compErr } = await c.from('subscriptions').update({ status: 'completed', completed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', sub.id).eq('status', 'active');
      if (!compErr) {
        s.completed += 1;
        await send({ type: 'completed', to, locale, planName, plansUrl: `${deps.origin}/${locale}/cairo/subscriptions` }).catch(() => { s.failed += 1; });
      }
    } else if (count === 1 && !sub.renewal_nudge_sent_at) {
      const code = `ROS10${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
      const expiresAt = new Date(Date.now() + 60 * 24 * 3600_000).toISOString();
      const { error: promoError } = await c.from('promo_codes').insert({ code, type: 'percent', percent_off: 10, minimum_order_minor: 0, starts_at: null, expires_at: expiresAt, max_uses: 1, used_count: 0, active: true });
      if (!promoError) {
        const { error: nudgeErr } = await c.from('subscriptions').update({ renewal_nudge_sent_at: new Date().toISOString(), renewal_promo_code: code, updated_at: new Date().toISOString() }).eq('id', sub.id).is('renewal_nudge_sent_at', null);
        if (!nudgeErr) {
          s.nudgesSent += 1;
          await send({ type: 'renewal_nudge', to, locale, planName, code, plansUrl: `${deps.origin}/${locale}/cairo/subscriptions` }).catch(() => { s.failed += 1; });
        }
      }
    }
  }

  // Pass 3 — expire stale pending_payment
  const cutoff = new Date((deps.today ?? new Date()).getTime() - 24 * 3600_000).toISOString();
  const pendingQuery = c.from('subscriptions')
    .select('id,checkout_order_id')
    .eq('status', 'pending_payment')
    .lt('created_at', cutoff);
  const { data: pending } = await bounded(pendingQuery, SUBSCRIPTION_BATCH_SIZE, { column: 'created_at', ascending: true });
  for (const p of (pending ?? []) as PendingRow[]) {
    s.expired += 1;
    await c.from('subscriptions').update({ status: 'cancelled', cancelled_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', p.id);
    if (p.checkout_order_id) await c.from('orders').update({ payment_status: 'cancelled' }).eq('id', p.checkout_order_id).in('payment_status', ['pending', 'payment_started', 'payment_failed']);
  }
  return s;
}
