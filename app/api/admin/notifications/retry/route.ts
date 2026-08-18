import { NextResponse } from 'next/server';
import { getCurrentAdmin } from '@/features/auth/server';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { getPublicOrigin } from '@/lib/origin';
import { logRouteError } from '@/lib/api';
import { resolveRetryLimits, retryStuckNotifications } from '@/features/notifications/notification-retry';

export async function POST(request: Request) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Admin authorization required' }, { status: 403 });
  try {
    const summary = await retryStuckNotifications(getAdminSupabase(), { orderUrlBase: getPublicOrigin(request), ...resolveRetryLimits() });
    return NextResponse.json({ ok: true, summary });
  } catch (error) {
    logRouteError('admin notification retry', error);
    return NextResponse.json({ error: 'Could not retry emails' }, { status: 503 });
  }
}
