import type { Frequency } from './types';

type CronClient = { from: (table: string) => any; rpc?: (name: string, args: Record<string, unknown>) => any };
export type SubscriptionCronSummary = { materialized: number; nudgesSent: number; completed: number; expired: number; failed: number };
export const MATERIALIZE_HORIZON_DAYS = 2;

function dateRef(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}
function unshift(ref: string, days: number): string {
  const [y = 0, m = 1, d = 1] = ref.split('-').map(Number);
  return dateRef(new Date(Date.UTC(y, m - 1, d) + days * 86_400_000));
}

export async function runSubscriptionsCron(
  client: CronClient,
  deps: { today?: Date; origin: string; send?: (input: { type: string; to: string; locale: 'en' | 'ar' | 'fr'; planName: string; code?: string; plansUrl?: string }) => Promise<void> },
): Promise<SubscriptionCronSummary> {
  const s: SubscriptionCronSummary = { materialized: 0, nudgesSent: 0, completed: 0, expired: 0, failed: 0 };
  const today = dateRef(deps.today ?? new Date());
  const send = deps.send ?? (async () => {});
  const c = client as any;

  // Pass 1 — materialize
  const { data: subs } = await c.from('subscriptions')
    .select('id,status,frequency,bundle_size,locale,renewal_nudge_sent_at,subscription_plans(name_en),profiles(email)')
    .in('status', ['active']);
  for (const sub of (subs ?? []) as any[]) {
    const { data: due } = await c.from('subscription_deliveries')
      .select('id,status,scheduled_date').eq('subscription_id', sub.id).eq('status', 'scheduled')
      .lte('scheduled_date', unshift(today, MATERIALIZE_HORIZON_DAYS));
    for (const delivery of (due ?? []) as any[]) {
      const { data, error } = await c.rpc('materialize_subscription_delivery', { p_subscription_id: sub.id, p_delivery_id: delivery.id });
      if (!error && data?.status === 'ordered') s.materialized += 1; else s.failed += 1;
    }
  }

  // Pass 2 — nudge at 1 remaining / complete when empty (issuance ± email wiring done in Task 9)
  for (const sub of (subs ?? []) as any[]) {
    const { data: remaining } = await c.from('subscription_deliveries').select('id,status').eq('subscription_id', sub.id).eq('status', 'scheduled');
    const count = ((remaining ?? []) as any[]).length;
    if (count === 0 && sub.status === 'active') {
      const { error } = await c.from('subscriptions').update({ status: 'completed', completed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', sub.id).eq('status', 'active');
      if (!error) s.completed += 1;
    }
  }

  // Pass 3 — expire stale pending_payment
  const cutoff = new Date((deps.today ?? new Date()).getTime() - 24 * 3600_000).toISOString();
  const { data: pending } = await c.from('subscriptions').select('id,checkout_order_id').eq('status', 'pending_payment').lt('created_at', cutoff);
  for (const p of (pending ?? []) as any[]) {
    s.expired += 1;
    await c.from('subscriptions').update({ status: 'cancelled', cancelled_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', p.id);
    if (p.checkout_order_id) await c.from('orders').update({ payment_status: 'cancelled' }).eq('id', p.checkout_order_id).in('payment_status', ['pending', 'payment_started', 'payment_failed']);
  }
  return s;
}
