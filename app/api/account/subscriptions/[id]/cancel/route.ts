import { NextResponse } from 'next/server';
import { getCurrentCustomer } from '@/features/auth/customer';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { cancelSubscriptionWithCredit } from '@/features/subscriptions/service';

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const customer = await getCurrentCustomer();
  if (!customer) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  const { id } = await context.params;
  const result = await cancelSubscriptionWithCredit(getAdminSupabase(), id, customer.id, { actor: 'customer', actorId: customer.id });
  if (!result.ok) {
    if (result.error === 'not_found') return NextResponse.json({ error: 'Subscription not found' }, { status: 404 });
    if (result.error === 'already_cancelled') return NextResponse.json({ error: 'Subscription already cancelled' }, { status: 409 });
    return NextResponse.json({ error: 'Cancellation failed' }, { status: 503 });
  }
  return NextResponse.json({ ok: true, creditMinor: result.creditMinor, giftCardCodeLast4: result.giftCardCodeLast4 });
}
