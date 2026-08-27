import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { getCurrentAdmin } from '@/features/auth/server';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { cancelSubscriptionWithCredit } from '@/features/subscriptions/service';

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await context.params;
  const client = getAdminSupabase();
  const { data: sub } = await client.from('subscriptions').select('id,customer_id').eq('id', id).maybeSingle();
  if (!sub) return NextResponse.json({ error: 'Subscription not found' }, { status: 404 });
  const result = await cancelSubscriptionWithCredit(client, id, String(sub.customer_id), { actor: 'admin', actorId: admin.userId });
  logger.info('admin.subscriptions.cancelled', { adminId: admin.userId, subscriptionId: id, ok: result.ok });
  if (!result.ok) {
    if (result.error === 'not_found') return NextResponse.json({ error: 'Subscription not found' }, { status: 404 });
    if (result.error === 'already_cancelled') return NextResponse.json({ error: 'Subscription already cancelled' }, { status: 409 });
    return NextResponse.json({ error: 'Cancellation failed' }, { status: 503 });
  }
  return NextResponse.json({ ok: true, creditMinor: result.creditMinor, giftCardCodeLast4: result.giftCardCodeLast4 });
}
