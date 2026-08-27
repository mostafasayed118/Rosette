import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { syncWishlistOnLogin } from '@/features/personalization/wishlist-sync';
import { logger } from '@/lib/logger';

const bodySchema = z.object({
  slugs: z.array(z.string().max(80)).max(50),
});

// Simple in-memory rate limiter: 10/min per customerId (or IP fallback)
// Mirrors lib/cron style but uses Map for per-user sliding window.
export const __rateLimitMap = new Map<string, number[]>();

function isRateLimited(key: string): boolean {
  const now = Date.now();
  const windowMs = 60_000;
  const max = 10;
  const existing = __rateLimitMap.get(key) ?? [];
  const filtered = existing.filter((t) => now - t < windowMs);
  if (filtered.length >= max) {
    __rateLimitMap.set(key, filtered);
    return true;
  }
  filtered.push(now);
  __rateLimitMap.set(key, filtered);
  return false;
}

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

  // Rate-limit per authenticated user, fallback to IP
  const ip = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? 'anon';
  const key = user.id ?? ip;
  if (isRateLimited(key)) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429, headers: { 'Retry-After': '60' } });
  }

  try {
    const result = await syncWishlistOnLogin(supabase as any, user.id, parsed.data.slugs);
    logger.info('wishlist.sync.served', { customerId: user.id, synced: result.synced });
    return NextResponse.json({ synced: result.synced });
  } catch (e) {
    logger.error('wishlist.sync.failed', { error: String(e) });
    return NextResponse.json({ error: 'sync_failed' }, { status: 500 });
  }
}
