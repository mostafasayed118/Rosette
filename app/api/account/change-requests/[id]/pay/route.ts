import { NextResponse } from 'next/server';
import { payChangeRequestDelta } from '@/features/orders/change-request-service';
import { getCurrentCustomer } from '@/features/auth/customer';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { getPublicOrigin } from '@/lib/origin';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const customer = await getCurrentCustomer();
  if (!customer) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  const { id } = await context.params;
  const result = await payChangeRequestDelta(getAdminSupabase(), { customerId: customer.id, requestId: id }, { origin: getPublicOrigin(request) });
  if (result.status === 'not_found') return NextResponse.json({ error: 'Change request not found' }, { status: 404 });
  if (result.status === 'not_payable') return NextResponse.json({ error: 'This change request cannot be paid yet' }, { status: 409 });
  if (result.status === 'guest_orders_unpayable') return NextResponse.json({ error: 'Guest orders cannot pay a change-request delta through this route' }, { status: 409 });
  if (result.status === 'failure') return NextResponse.json({ error: 'Could not start the payment' }, { status: 503 });
  return NextResponse.json({ checkoutUrl: result.checkoutUrl }, { status: 200 });
}
