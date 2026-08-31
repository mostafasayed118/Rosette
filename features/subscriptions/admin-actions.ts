import type { AdminIdentity } from '@/features/admin/authorization';
type Client = { from: (table: string) => any; rpc?: (name: string, args: Record<string, unknown>) => any };

type AdminSubRow = {
  id: string; status: string; frequency: string; bundle_size: number; price_minor: number;
  created_at: string; subscription_plans?: { name_en?: string } | null; profiles?: { email?: string } | null;
};
type AdminTimelineRow = {
  id: string; scheduled_date: string; status: string; order_id: string | null;
  subscriptions?: {
    subscription_plans?: { name_en?: string } | null;
    recipient_name?: string | null;
    delivery_city_code?: string | null;
    delivery_window?: string | null;
  } | null;
};

function canOperate(identity: AdminIdentity) { return identity.role === 'admin' || identity.role === 'operator'; }

export async function listAdminSubscriptions(client: Client, identity: AdminIdentity, filters: { status?: string }): Promise<Record<string, any>[]> {
  if (!canOperate(identity)) return [];
  const q = client.from('subscriptions').select('*,subscription_plans(name_en,slug),profiles(email)').order('created_at', { ascending: false });
  const { data } = filters.status ? await q.eq('status', filters.status) : await q;
  return ((data ?? []) as AdminSubRow[]).map((row) => ({ id: String(row.id), planName: String(row.subscription_plans?.name_en ?? ''), status: row.status, frequency: row.frequency, bundleSize: Number(row.bundle_size), priceMinor: Number(row.price_minor), customerEmail: String(row.profiles?.email ?? ''), createdAt: String(row.created_at) }));
}

export async function getAdminTimeline(client: Client, days = 14): Promise<Record<string, any>[]> {
  const today = new Date();
  const from = today.toISOString();
  const to = new Date(today.getTime() + days * 86_400_000).toISOString();
  const { data } = await client.from('subscription_deliveries')
    .select('id,scheduled_date,status,subscription_id,order_id,subscriptions(subscription_plans(name_en),recipient_name,delivery_city_code,delivery_window)')
    .gte('scheduled_date', from.slice(0, 10)).lte('scheduled_date', to.slice(0, 10));
  return ((data ?? []) as AdminTimelineRow[]).map((row) => ({
    id: String(row.id), scheduledDate: String(row.scheduled_date), status: row.status,
    orderId: row.order_id ? String(row.order_id) : null,
    planName: String(row.subscriptions?.subscription_plans?.name_en ?? ''),
    recipient: String(row.subscriptions?.recipient_name ?? ''), city: String(row.subscriptions?.delivery_city_code ?? ''), window: String(row.subscriptions?.delivery_window ?? ''),
  }));
}
