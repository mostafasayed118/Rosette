import { NextResponse } from 'next/server';
import { getCurrentCustomer } from '@/features/auth/customer';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { pauseSubscription } from '@/features/subscriptions/control';

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const customer = await getCurrentCustomer();
  if (!customer) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  const { id } = await context.params;
  const ok = await pauseSubscription(getAdminSupabase(), id, customer.id);
  if (!ok) return NextResponse.json({ error: 'Subscription cannot be paused' }, { status: 409 });
  return NextResponse.json({ ok: true });
}
