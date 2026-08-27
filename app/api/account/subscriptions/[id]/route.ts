import { NextResponse } from 'next/server';
import { getCurrentCustomer } from '@/features/auth/customer';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { getSubscriptionDetail } from '@/features/subscriptions/control';

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const customer = await getCurrentCustomer();
  if (!customer) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  const { id } = await context.params;
  const detail = await getSubscriptionDetail(getAdminSupabase(), id);
  if (!detail || detail.customerId !== customer.id) return NextResponse.json({ error: 'Subscription not found' }, { status: 404 });
  return NextResponse.json({ subscription: detail });
}
