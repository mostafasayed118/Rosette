import { NextResponse } from 'next/server';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { getPublicOrigin } from '@/lib/origin';
import { createGiftCardPurchase } from '@/features/gift-cards/service';
import type { GiftCardPurchaseInput } from '@/features/gift-cards/types';
import { logger } from '@/lib/logger';
import { RATE_LIMITS, enforceRateLimit } from '@/lib/rate-limit-guard';

export async function POST(request: Request) {
  const limited = await enforceRateLimit(request, RATE_LIMITS.giftCardPurchase);
  if (limited) return limited;
  try {
    const body = await request.json() as { purchase?: unknown; locale?: unknown };
    if (!body.purchase || typeof body.purchase !== 'object') return NextResponse.json({ error: 'Invalid gift-card details' }, { status: 400 });
    const result = await createGiftCardPurchase(getAdminSupabase(), body.purchase as GiftCardPurchaseInput, { origin: getPublicOrigin(request) });
    if (!result.ok) return NextResponse.json({ error: result.error === 'invalid_input' ? 'Invalid gift-card details' : 'Gift-card checkout is temporarily unavailable.' }, { status: result.error === 'invalid_input' ? 400 : 503 });
    return NextResponse.json({ purchaseReference: result.value.reference, checkoutUrl: result.value.checkoutUrl });
  } catch (error) {
    logger.error('route.error', { scope: 'gift-card purchase', error });
    return NextResponse.json({ error: 'Gift-card checkout is temporarily unavailable.' }, { status: 503 });
  }
}
