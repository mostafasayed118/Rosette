import { NextResponse } from 'next/server';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { getRequiredServerEnv } from '@/lib/server-env';
import { getPublicOrigin } from '@/lib/origin';
import { logger } from '@/lib/logger';
import { isCronAuthorizedForJob } from '@/lib/cron';
import { runOccasionCron } from '@/features/occasions/occasions-cron';

async function handle(request: Request) {
  try {
    if (!isCronAuthorizedForJob(request.headers.get('authorization'), 'OCCASIONS')) {
      logger.warn('cron.occasions.unauthorized');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    logger.info('cron.occasions.started');
    const summary = await runOccasionCron(getAdminSupabase(), {
      origin: getPublicOrigin(request),
      secret: getRequiredServerEnv('EMAIL_PREFERENCES_SECRET'),
    });
    logger.info('cron.occasions.completed', { summary });
    return NextResponse.json({ ok: true, summary });
  } catch (error) {
    logger.error('route.error', { scope: 'occasion reminders', error });
    logger.error('cron.occasions.failed', { error });
    return NextResponse.json({ error: 'Occasion job failed' }, { status: 503 });
  }
}

export async function GET(request: Request) { return handle(request); }
export async function POST(request: Request) { return handle(request); }
