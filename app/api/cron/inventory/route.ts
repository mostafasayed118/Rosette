import { NextResponse } from 'next/server';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { logger } from '@/lib/logger';
import { isCronAuthorizedForJob } from '@/lib/cron';

// Cap the sweep so a backlog of expired reservations cannot turn one request
// into an unbounded transaction. Leftover rows are picked up by the next run.
const BATCH_SIZE = 500;

async function handle(request: Request) {
  try {
    if (!isCronAuthorizedForJob(request.headers.get('authorization'), 'INVENTORY')) {
      logger.warn('cron.inventory.unauthorized');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    logger.info('cron.inventory.started');
    const { data, error } = await getAdminSupabase().rpc('release_expired_reservations', { p_batch_size: BATCH_SIZE });
    if (error) throw error;
    logger.info('cron.inventory.completed', { summary: data });
    return NextResponse.json({ ok: true, summary: data });
  } catch (error) {
    logger.error('route.error', { scope: 'inventory reservation sweep', error });
    logger.error('cron.inventory.failed', { error });
    return NextResponse.json({ error: 'Inventory job failed' }, { status: 503 });
  }
}

export async function GET(request: Request) { return handle(request); }
export async function POST(request: Request) { return handle(request); }
