import { NextResponse } from 'next/server';
import { getCurrentCustomer } from '@/features/auth/customer';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { resumeSubscription } from '@/features/subscriptions/control';
import { logger } from '@/lib/logger';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const customer = await getCurrentCustomer();
    if (!customer) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    const { id } = await context.params;
    const body = (await request.json().catch(() => null)) as { nextDeliveryDate?: unknown } | null;
    const nextDeliveryDate = typeof body?.nextDeliveryDate === 'string' ? body.nextDeliveryDate : '';
    if (!DATE_RE.test(nextDeliveryDate) || Number.isNaN(new Date(`${nextDeliveryDate}T00:00:00Z`).getTime())) {
      return NextResponse.json({ error: 'Invalid next delivery date' }, { status: 400 });
    }
    const ok = await resumeSubscription(getAdminSupabase(), id, customer.id, nextDeliveryDate);
    if (!ok) return NextResponse.json({ error: 'Subscription cannot be resumed' }, { status: 409 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    logger.error('route.error', { scope: 'subscription resume', error });
    return NextResponse.json({ error: 'Could not resume subscription' }, { status: 503 });
  }
}
