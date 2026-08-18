import { NextResponse } from 'next/server';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { getRequiredServerEnv } from '@/lib/server-env';
import { getPublicOrigin } from '@/lib/origin';
import { logRouteError } from '@/lib/api';
import { isCronAuthorized } from '@/lib/cron';
import { retryStuckNotifications } from '@/features/notifications/notification-retry';

async function handle(request: Request) {
  try {
    if (!isCronAuthorized(request.headers.get('authorization'), getRequiredServerEnv('CRON_SECRET'))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const summary = await retryStuckNotifications(getAdminSupabase(), { orderUrlBase: getPublicOrigin(request) });
    return NextResponse.json({ ok: true, summary });
  } catch (error) {
    logRouteError('notification retry', error);
    return NextResponse.json({ error: 'Retry job failed' }, { status: 503 });
  }
}

export async function GET(request: Request) { return handle(request); }
export async function POST(request: Request) { return handle(request); }
