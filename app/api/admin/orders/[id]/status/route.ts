import { NextResponse } from 'next/server';
import { updateFulfillmentStatus } from '@/features/admin/order-actions';
import { getCurrentAdmin } from '@/features/auth/server';
import type { FulfillmentStatus } from '@/features/commerce/order-state';
import { getAdminSupabase } from '@/lib/supabase/admin';

const statuses = new Set<FulfillmentStatus>(['confirmed', 'preparing', 'ready_for_delivery', 'out_for_delivery', 'delivered', 'cancelled']);

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Admin authorization required' }, { status: 403 });
  const { id } = await context.params;
  const body = (await request.json()) as { status?: unknown };
  if (typeof body.status !== 'string' || !statuses.has(body.status as FulfillmentStatus)) return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
  const result = await updateFulfillmentStatus(getAdminSupabase(), { admin, orderId: id, status: body.status as FulfillmentStatus, orderUrlBase: new URL(request.url).origin });
  if (result === 'missing_order') return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  if (result === 'invalid_or_unauthorized') return NextResponse.json({ error: 'Invalid or unauthorized transition' }, { status: 409 });
  if (result === 'failure') return NextResponse.json({ error: 'Could not update order' }, { status: 500 });
  return NextResponse.json({ ok: true, status: body.status });
}