import { NextResponse } from 'next/server';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { getPublicOrigin } from '@/lib/origin';
import { logger } from '@/lib/logger';
import { isCronAuthorizedForJob } from '@/lib/cron';
import { runSubscriptionsCron } from '@/features/subscriptions/subscriptions-cron';

async function handle(request: Request) {
  if (!isCronAuthorizedForJob(request.headers.get('authorization'), 'SUBSCRIPTIONS')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const summary = await runSubscriptionsCron(getAdminSupabase(), { origin: getPublicOrigin(request) });
    logger.info('cron.subscriptions.completed', { summary });
    return NextResponse.json({ ok: true, summary });
  } catch (error) {
    logger.error('cron.subscriptions.failed', { error });
    return NextResponse.json({ error: 'Subscription job failed' }, { status: 503 });
  }
}
export async function GET(request: Request) { return handle(request); }
export async function POST(request: Request) { return handle(request); }
