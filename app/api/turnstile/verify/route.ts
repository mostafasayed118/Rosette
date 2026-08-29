import { NextResponse } from 'next/server';
import { getRequiredServerEnv } from '@/lib/server-env';
import { verifyTurnstileToken } from '@/lib/turnstile';
import { RATE_LIMITS, enforceRateLimit } from '@/lib/rate-limit-guard';
import { logger } from '@/lib/logger';

export async function POST(req: Request) {
  const limited = await enforceRateLimit(req, RATE_LIMITS.turnstileVerify);
  if (limited) return limited;
  try {
    const body = (await req.json()) as { token?: unknown };
    if (typeof body.token !== 'string' || !body.token) return NextResponse.json({ success: false, error: 'Missing token' }, { status: 400 });
    const secret = getRequiredServerEnv('TURNSTILE_SECRET_KEY');
    const ip = req.headers.get('cf-connecting-ip') ?? req.headers.get('x-forwarded-for') ?? undefined;
    const result = await verifyTurnstileToken(body.token, secret, ip);
    return NextResponse.json(result);
  } catch (error) {
    logger.error('route.error', { scope: 'turnstile verify', error });
    return NextResponse.json({ success: false, error: 'Verification failed' }, { status: 500 });
  }
}
