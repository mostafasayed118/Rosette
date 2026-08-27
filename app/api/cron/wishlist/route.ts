import { NextResponse } from 'next/server';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { getRequiredServerEnv } from '@/lib/server-env';
import { getPublicOrigin } from '@/lib/origin';
import { logger } from '@/lib/logger';
import { isCronAuthorizedForJob } from '@/lib/cron';
import { runWishlistCron } from '@/features/wishlist/wishlist-cron';

async function handle(request: Request) {
  try {
    if (!isCronAuthorizedForJob(request.headers.get('authorization'), 'WISHLIST')) {
      logger.warn('cron.wishlist.unauthorized');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    logger.info('cron.wishlist.started');
    const summary = await runWishlistCron(getAdminSupabase(), { origin: getPublicOrigin(request), secret: getRequiredServerEnv('EMAIL_PREFERENCES_SECRET') });
    logger.info('cron.wishlist.completed', { summary });
    return NextResponse.json({ ok: true, summary });
  } catch (error) {
    logger.error('route.error', { scope: 'wishlist price watch', error });
    logger.error('cron.wishlist.failed', { error });
    return NextResponse.json({ error: 'Wishlist job failed' }, { status: 503 });
  }
}

export async function GET(request: Request) { return handle(request); }
export async function POST(request: Request) { return handle(request); }
