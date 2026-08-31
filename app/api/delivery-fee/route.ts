import { NextResponse } from 'next/server';
import { getCity } from '@/features/destination/data';
import { applyDeliveryRule, fetchDeliveryRule, resolveDeliveryFee, DEFAULT_DELIVERY_FEE_MINOR } from '@/features/order/delivery-rules';
import { getServerSupabase } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';

export async function GET(request: Request) {
  try {
    const cityCode = new URL(request.url).searchParams.get('city');
    const city = cityCode ? getCity(cityCode) : null;
    if (!city) return NextResponse.json({ error: 'Unknown city' }, { status: 400 });

    const supabase = await getServerSupabase();
    const rule = supabase ? await fetchDeliveryRule(supabase, city.code) : null;
    const fallback = resolveDeliveryFee(city.code, 0) ?? DEFAULT_DELIVERY_FEE_MINOR;
    const { feeMinor } = applyDeliveryRule(rule, 0, fallback);
    return NextResponse.json({ cityCode: city.code, feeMinor });
  } catch (error) {
    logger.error('route.error', { scope: 'delivery fee lookup', error });
    return NextResponse.json({ error: 'Could not load delivery fee' }, { status: 503 });
  }
}
