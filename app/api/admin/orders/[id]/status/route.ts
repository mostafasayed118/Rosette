import { NextResponse } from 'next/server';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { getCurrentAdmin } from '@/features/auth/server';
import { canUpdateOrderStatus } from '@/features/admin/authorization';
import type { FulfillmentStatus } from '@/features/commerce/order-state';

const statuses = new Set<FulfillmentStatus>(['confirmed', 'preparing', 'ready_for_delivery', 'out_for_delivery', 'delivered', 'cancelled']);

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Admin authorization required' }, { status: 403 });
  const { id } = await context.params;
  const body = (await request.json()) as { status?: unknown };
  if (typeof body.status !== 'string' || !statuses.has(body.status as FulfillmentStatus)) return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
  const status = body.status as FulfillmentStatus;
  const supabase = getAdminSupabase();
  const { data: order, error: readError } = await supabase.from('orders').select('id,fulfillment_status').eq('id', id).maybeSingle();
  if (readError || !order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  if (!canUpdateOrderStatus(admin.role, order.fulfillment_status as FulfillmentStatus, status)) return NextResponse.json({ error: 'Invalid or unauthorized transition' }, { status: 409 });
  const { error } = await supabase.from('orders').update({ fulfillment_status: status, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) return NextResponse.json({ error: 'Could not update order' }, { status: 500 });
  await supabase.from('order_events').insert({ order_id: id, actor_id: admin.userId, event_type: 'fulfillment_status_changed', from_status: order.fulfillment_status, to_status: status });
  await supabase.from('admin_audit_logs').insert({ actor_id: admin.userId, action: 'update_order_status', target_type: 'order', target_id: id, metadata: { status } });
  return NextResponse.json({ ok: true, status });
}
