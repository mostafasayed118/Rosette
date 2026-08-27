import { NextResponse } from 'next/server';
import { computeDiscount, validatePromo } from '@/features/promo/apply';
import { fetchPromo } from '@/features/promo/repository';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { RATE_LIMITS, enforceRateLimit } from '@/lib/rate-limit-guard';

export async function GET(request: Request) {
  const limited = await enforceRateLimit(request, RATE_LIMITS.promoValidate);
  if (limited) return limited;
  const url = new URL(request.url);
  const code = url.searchParams.get('code')?.trim();
  const subtotalRaw = url.searchParams.get('subtotal');
  const subtotal = subtotalRaw ? Number(subtotalRaw) : NaN;
  if (!code || !Number.isInteger(subtotal) || subtotal < 0) return NextResponse.json({ valid: false, error: 'not_found' }, { status: 400 });
  const promo = await fetchPromo(getAdminSupabase(), code);
  if (!promo) return NextResponse.json({ valid: false, error: 'not_found' });
  const promoError = validatePromo(promo, subtotal, new Date());
  if (promoError) return NextResponse.json({ valid: false, error: promoError });
  const { discountMinor, totalMinor } = computeDiscount(promo, subtotal);
  return NextResponse.json({ valid: true, discountMinor, totalMinor });
}
