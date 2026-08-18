import { NextResponse } from 'next/server';
import { reviewCancellationRequest } from '@/features/orders/cancel-actions';
import { getCurrentAdmin } from '@/features/auth/server';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { getPublicOrigin } from '@/lib/origin';
import { respond } from '@/lib/api';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Admin authorization required' }, { status: 403 });
  const { id } = await context.params;
  const body = (await request.json()) as { action?: unknown; reason?: unknown };
  if (body.action !== 'approve' && body.action !== 'reject') return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  const reason = typeof body.reason === 'string' ? body.reason.trim() || undefined : undefined;
  const result = await reviewCancellationRequest(getAdminSupabase(), { admin, requestId: id, action: body.action, reason, orderUrlBase: getPublicOrigin(request) });
  return respond(result, {
    not_found: { status: 404, error: 'Request not found' },
    not_cancellable: { status: 409, error: 'Order is no longer cancellable' },
    failure: { status: 500, error: 'Could not review cancellation' },
  }, { ok: true, status: result.status });
}
