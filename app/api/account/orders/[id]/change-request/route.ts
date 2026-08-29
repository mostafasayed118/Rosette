import { NextResponse } from 'next/server';
import { submitChangeRequest } from '@/features/orders/change-request-service';
import { getCurrentCustomer } from '@/features/auth/customer';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { getPublicOrigin } from '@/lib/origin';
import { logger } from '@/lib/logger';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const customer = await getCurrentCustomer();
    if (!customer) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    const { id } = await context.params;
    const body = (await request.json()) as { changes?: unknown; reason?: unknown };
    const result = await submitChangeRequest(
      getAdminSupabase(),
      {
        customerId: customer.id,
        orderId: id,
        changes: body.changes,
        reason: typeof body.reason === 'string' ? body.reason : undefined,
      },
      { orderUrlBase: getPublicOrigin(request) },
    );
    if (result.status === 'not_found') return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    if (result.status === 'ineligible') return NextResponse.json({ error: result.reason }, { status: 409 });
    if (result.status === 'invalid') return NextResponse.json({ error: result.error }, { status: 400 });
    if (result.status === 'failure') return NextResponse.json({ error: 'Could not request the change' }, { status: 500 });
    if (result.status === 'created') return NextResponse.json({ ok: true, requestId: result.requestId }, { status: 201 });
    return NextResponse.json({ ok: true, applied: true, deltaMinor: result.deltaMinor }, { status: 200 });
  } catch (error) {
    logger.error('route.error', { scope: 'order change request', error });
    return NextResponse.json({ error: 'Could not request the change' }, { status: 503 });
  }
}
