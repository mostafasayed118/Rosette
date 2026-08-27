import { NextResponse } from 'next/server';
import { updateFulfillmentStatus, updateGroupFulfillmentStatus } from '@/features/admin/order-actions';
import { getCurrentAdmin } from '@/features/auth/server';
import type { FulfillmentStatus } from '@/features/commerce/order-state';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { getPublicOrigin } from '@/lib/origin';
import { respond } from '@/lib/api';

const statuses = new Set<FulfillmentStatus>(['confirmed', 'preparing', 'ready_for_delivery', 'out_for_delivery', 'delivered', 'cancelled']);

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Admin authorization required' }, { status: 403 });
  const { id } = await context.params;
  const body = (await request.json()) as { status?: unknown; groupId?: unknown };
  if (typeof body.status !== 'string' || !statuses.has(body.status as FulfillmentStatus)) return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
  const result = typeof body.groupId === 'string' && body.groupId
    ? await updateGroupFulfillmentStatus(getAdminSupabase(), { admin, orderId: id, groupId: body.groupId, status: body.status as FulfillmentStatus, orderUrlBase: getPublicOrigin(request) })
    : await updateFulfillmentStatus(getAdminSupabase(), { admin, orderId: id, status: body.status as FulfillmentStatus, orderUrlBase: getPublicOrigin(request) });
  return respond(result, {
    missing_order: { status: 404, error: 'Order not found' },
    invalid_or_unauthorized: { status: 409, error: 'Invalid or unauthorized transition' },
    failure: { status: 500, error: 'Could not update order' },
  }, { ok: true, status: body.status });
}