import { NextResponse } from 'next/server';
import { upsertCart } from '@/features/cart/cart-sync';
import { getCurrentCustomer } from '@/features/auth/customer';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { logger } from '@/lib/logger';
import { enforceRateLimit } from '@/lib/rate-limit-guard';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';

const CART_SYNC_EMAIL = { bucket: 'cart-sync-email', limit: 5, windowMs: 12_000 };

export async function POST(request: Request) {
  try {
    const ipLimited = await enforceRateLimit(request, { bucket: 'cart-sync-ip', limit: 30, windowMs: 60_000, error: 'Too many requests' });
    if (ipLimited) return ipLimited;
    const customer = await getCurrentCustomer();
    const body = (await request.json().catch(() => null)) as { email?: unknown; locale?: unknown; city?: unknown; lines?: unknown } | null;
    if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
    // For signed-in customers the email is taken from the session so an
    // attacker cannot overwrite an account-bound bag by guessing the victim's
    // email. Guest saves (SaveBagField) use the body email and remain
    // keyed by (email, customer_id IS NULL) — overwriting a guest bag
    // requires knowing the victim's email, is rate-limited per IP+email,
    // and cannot exfiltrate the bag (restore requires the 24-byte random
    // token). This is accepted residual risk for the guest flow.
    const email = (customer?.email ?? (typeof body.email === 'string' ? body.email : '')).trim().toLowerCase();
    const locale = body.locale === 'ar' || body.locale === 'fr' ? body.locale : 'en';
    const city = typeof body.city === 'string' && body.city.length > 0 ? body.city.slice(0, 40) : 'cairo';
    if (!email) return NextResponse.json({ error: 'Email required' }, { status: 400 });
    // Per-email throttle (self-pruning) on top of the per-IP guard so distinct
    // spoofed emails cannot each open a fresh write window.
    const emailResult = await checkRateLimit({ ...CART_SYNC_EMAIL, identifier: `${getClientIp(request)}:${email}` });
    if (!emailResult.allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    const result = await upsertCart(getAdminSupabase(), { email, customerId: customer?.id ?? null, locale, city, lines: (body.lines as never) ?? [] });
    if (result.status === 'invalid') return NextResponse.json({ error: 'Invalid cart' }, { status: 400 });
    if (result.status === 'failure') return NextResponse.json({ error: 'Could not save the cart' }, { status: 500 });
    return NextResponse.json({ restoreToken: result.restoreToken }, { status: 200 });
  } catch (error) {
    logger.error('route.error', { scope: 'cart sync', error });
    return NextResponse.json({ error: 'Cart save is temporarily unavailable.' }, { status: 503 });
  }
}
