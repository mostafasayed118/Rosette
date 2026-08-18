import { NextResponse } from 'next/server';
import { getCurrentAdmin } from '@/features/auth/server';
import { reviewChangeRequest } from '@/features/orders/change-request-service';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { getPublicOrigin } from '@/lib/origin';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { id } = await context.params;
  const body = (await request.json()) as { action?: unknown; reason?: unknown };
  const action = body.action === 'approve' ? 'approve' : body.action === 'reject' ? 'reject' : null;
  if (!action) return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  const result = await reviewChangeRequest(getAdminSupabase(), { admin, requestId: id, action, reason: typeof body.reason === 'string' ? body.reason : undefined, orderUrlBase: getPublicOrigin(request) });
  if (result.status === 'not_found') return NextResponse.json({ error: 'Change request not found' }, { status: 404 });
  if (result.status === 'not_applicable') return NextResponse.json({ error: 'This change request can no longer be reviewed' }, { status: 409 });
  if (result.status === 'refund_failed') return NextResponse.json({ error: 'The refund failed — the request stays pending. Retry.' }, { status: 502 });
  if (result.status === 'failure') return NextResponse.json({ error: 'Could not review the change request' }, { status: 500 });
  if (result.status === 'rejected') return NextResponse.json({ ok: true, status: 'rejected' }, { status: 200 });
  return NextResponse.json({ ok: true, status: result.status, deltaMinor: result.deltaMinor }, { status: 200 });
}
