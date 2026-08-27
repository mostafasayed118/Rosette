import { NextResponse } from 'next/server';
import { getCurrentCustomer } from '@/features/auth/customer';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { rescheduleDeliveries } from '@/features/subscriptions/control';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function POST(request: Request, context: { params: Promise<{ id: string; deliveryId: string }> }) {
  const customer = await getCurrentCustomer();
  if (!customer) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  const { id, deliveryId } = await context.params;
  const body = await request.json().catch(() => null);
  const date = String((body as any)?.date ?? '');
  if (!DATE_RE.test(date) || Number.isNaN(new Date(`${date}T00:00:00Z`).getTime())) {
    return NextResponse.json({ error: 'Invalid delivery date' }, { status: 400 });
  }
  const ok = await rescheduleDeliveries(getAdminSupabase(), id, customer.id, deliveryId, date, false);
  if (!ok) return NextResponse.json({ error: 'Delivery cannot be rescheduled' }, { status: 409 });
  return NextResponse.json({ ok: true });
}
