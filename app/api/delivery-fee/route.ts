import { NextResponse } from 'next/server';
import { getCity } from '@/features/destination/data';
import { estimateDeliveryFeeMinor } from '@/features/destination/delivery-fee';
import { applyDeliveryRule, DEFAULT_DELIVERY_FEE_MINOR, fetchDeliveryRule } from '@/features/order/delivery-rules';
import { getServerSupabase } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const cityCode = new URL(request.url).searchParams.get('city');
  const city = cityCode ? getCity(cityCode) : null;
  if (!city) return NextResponse.json({ error: 'Unknown city' }, { status: 400 });

  const supabase = await getServerSupabase();
  const rule = supabase ? await fetchDeliveryRule(supabase, city.code) : null;
  const fallback = estimateDeliveryFeeMinor(city.code) ?? DEFAULT_DELIVERY_FEE_MINOR;
  const { feeMinor } = applyDeliveryRule(rule, 0, fallback);
  return NextResponse.json({ cityCode: city.code, feeMinor });
}