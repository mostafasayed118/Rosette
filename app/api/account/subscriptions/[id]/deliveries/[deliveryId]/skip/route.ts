import { NextResponse } from 'next/server';
import { getCurrentCustomer } from '@/features/auth/customer';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { skipDelivery } from '@/features/subscriptions/control';

export async function POST(_request: Request, context: { params: Promise<{ id: string; deliveryId: string }> }) {
  const customer = await getCurrentCustomer();
  if (!customer) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  const { id, deliveryId } = await context.params;
  const ok = await skipDelivery(getAdminSupabase(), id, customer.id, deliveryId);
  if (!ok) return NextResponse.json({ error: 'Delivery cannot be skipped' }, { status: 409 });
  return NextResponse.json({ ok: true });
}
