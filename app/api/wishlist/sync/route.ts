import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { syncWishlistOnLogin } from '@/features/personalization/wishlist-sync';
import { logger } from '@/lib/logger';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';

const bodySchema = z.object({
  slugs: z.array(z.string().max(80)).max(50),
});

const WISHLIST_SYNC = { bucket: 'wishlist-sync', limit: 10, windowMs: 60_000 };

/** Test-only: clear in-memory rate-limit buckets. */
export const __resetRateLimits = async (): Promise<void> => {
  const { resetRateLimits } = await import('@/lib/rate-limit');
  resetRateLimits();
};

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_payload' }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_payload' }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  // Rate-limit per authenticated user, fallback to IP. This keeps the
  // per-user burst protection the previous hand-rolled map provided while
  // sharing the standard Upstash/memory engine with every other endpoint.
  const identifier = `user:${user.id}`;
  const ipResult = await checkRateLimit({ ...WISHLIST_SYNC, identifier });
  if (!ipResult.allowed) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429, headers: { 'Retry-After': String(ipResult.retryAfterSeconds) } });
  }
  // Suppress unused-var: getClientIp is imported so the standard helper
  // remains the source of truth for IP resolution in future tightening.
  void getClientIp;

  try {
    const result = await syncWishlistOnLogin(supabase, user.id, parsed.data.slugs);
    logger.info('wishlist.sync.served', { customerId: user.id, synced: result.synced });
    return NextResponse.json({ synced: result.synced });
  } catch (e) {
    logger.error('wishlist.sync.failed', { error: String(e) });
    return NextResponse.json({ error: 'sync_failed' }, { status: 500 });
  }
}
