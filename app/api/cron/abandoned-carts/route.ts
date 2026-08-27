import { NextResponse } from 'next/server';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { getPublicOrigin } from '@/lib/origin';
import { logger } from '@/lib/logger';
import { isCronAuthorizedForJob } from '@/lib/cron';
import { runAbandonedCartCron } from '@/features/cart/abandoned-cron';

async function handle(request: Request) {
  try {
    if (!isCronAuthorizedForJob(request.headers.get('authorization'), 'ABANDONED_CARTS')) {
      logger.warn('cron.abandoned_carts.unauthorized');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    logger.info('cron.abandoned_carts.started');
    const summary = await runAbandonedCartCron(getAdminSupabase(), { origin: getPublicOrigin(request) });
    logger.info('cron.abandoned_carts.completed', { summary });
    return NextResponse.json({ ok: true, summary });
  } catch (error) {
    logger.error('route.error', { scope: 'abandoned-cart recovery', error });
    logger.error('cron.abandoned_carts.failed', { error });
    return NextResponse.json({ error: 'Abandoned-cart job failed' }, { status: 503 });
  }
}

export async function GET(request: Request) { return handle(request); }
export async function POST(request: Request) { return handle(request); }
