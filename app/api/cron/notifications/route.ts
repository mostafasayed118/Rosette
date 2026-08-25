import { NextResponse } from 'next/server';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { getRequiredServerEnv } from '@/lib/server-env';
import { getPublicOrigin } from '@/lib/origin';
import { logger } from '@/lib/logger';
import { isCronAuthorized } from '@/lib/cron';
import { resolveRetryLimits, retryStuckNotifications } from '@/features/notifications/notification-retry';

async function handle(request: Request) {
  try {
    if (!isCronAuthorized(request.headers.get('authorization'), getRequiredServerEnv('CRON_SECRET'))) {
      logger.warn('cron.notifications.unauthorized');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    logger.info('cron.notifications.started');
    const summary = await retryStuckNotifications(getAdminSupabase(), { orderUrlBase: getPublicOrigin(request), ...resolveRetryLimits() });
    logger.info('cron.notifications.completed', { summary });
    return NextResponse.json({ ok: true, summary });
  } catch (error) {
    logger.error('route.error', { scope: 'notification retry', error });
    logger.error('cron.notifications.failed', { error });
    return NextResponse.json({ error: 'Retry job failed' }, { status: 503 });
  }
}

export async function GET(request: Request) { return handle(request); }
export async function POST(request: Request) { return handle(request); }
