import { NextResponse } from 'next/server';
import { upsertCart } from '@/features/cart/cart-sync';
import { getCurrentCustomer } from '@/features/auth/customer';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { logRouteError } from '@/lib/api';

const recent = new Map<string, number>();

export async function POST(request: Request) {
  try {
    const customer = await getCurrentCustomer();
    const body = (await request.json().catch(() => null)) as { email?: unknown; locale?: unknown; city?: unknown; lines?: unknown } | null;
    if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
    const email = (customer?.email ?? (typeof body.email === 'string' ? body.email : '')).trim().toLowerCase();
    const locale = body.locale === 'ar' || body.locale === 'fr' ? body.locale : 'en';
    const city = typeof body.city === 'string' && body.city.length > 0 ? body.city.slice(0, 40) : 'cairo';
    if (!email) return NextResponse.json({ error: 'Email required' }, { status: 400 });
    const now = Date.now();
    if (now - (recent.get(email) ?? 0) < 12_000) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    recent.set(email, now);
    const result = await upsertCart(getAdminSupabase(), { email, customerId: customer?.id ?? null, locale, city, lines: (body.lines as never) ?? [] });
    if (result.status === 'invalid') return NextResponse.json({ error: 'Invalid cart' }, { status: 400 });
    if (result.status === 'failure') return NextResponse.json({ error: 'Could not save the cart' }, { status: 500 });
    return NextResponse.json({ restoreToken: result.restoreToken }, { status: 200 });
  } catch (error) {
    logRouteError('cart sync', error);
    return NextResponse.json({ error: 'Cart save is temporarily unavailable.' }, { status: 503 });
  }
}
