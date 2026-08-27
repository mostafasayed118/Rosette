import { NextResponse } from 'next/server';
import { getOptionalServerEnv } from '@/lib/server-env';
import { getPublicOrigin } from '@/lib/origin';
import { getCurrentCustomer } from '@/features/auth/customer';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { resolvePaymentMethodAvailability } from '@/features/checkout/payment-mode';
import { RATE_LIMITS, enforceRateLimit } from '@/lib/rate-limit-guard';
import { getClientIp } from '@/lib/rate-limit';
import { checkTurnstileToken } from '@/lib/turnstile';
import { createSubscription } from '@/features/subscriptions/service';

export async function POST(request: Request) {
  const limited = await enforceRateLimit(request, RATE_LIMITS.orders);
  if (limited) return limited;
  const customer = await getCurrentCustomer();
  if (!customer) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Malformed request' }, { status: 400 });
  const turnstile = await checkTurnstileToken(body.turnstileToken, getOptionalServerEnv('TURNSTILE_SECRET_KEY'), getClientIp(request));
  if (turnstile !== 'pass') return NextResponse.json({ error: turnstile === 'missing' ? 'Human verification required' : 'Human verification failed' }, { status: 400 });
  const paymentMethod = (body.paymentMethod as string) ?? 'paymob';
  const paymentPath = resolvePaymentMethodAvailability(paymentMethod as 'paymob' | 'pay-on-delivery' | 'demo-card');
  if (!paymentPath.allowed || paymentMethod === 'pay-on-delivery') return NextResponse.json({ error: 'Payment method unavailable' }, { status: 409 });
  const result = await createSubscription(getAdminSupabase(), {
    slug: String(body.planSlug ?? ''), frequency: body.frequency, bundleSize: Number(body.bundleSize),
    recipientName: String(body.recipientName ?? ''), recipientPhone: String(body.recipientPhone ?? ''),
    deliveryAddress: String(body.deliveryAddress ?? ''), cityCode: String(body.cityCode ?? ''),
    deliveryWindow: String(body.deliveryWindow ?? ''), deliveryDate: String(body.deliveryDate ?? ''),
    locale: (body.locale === 'ar' || body.locale === 'fr' ? body.locale : 'en') as 'en' | 'ar' | 'fr',
    giftMessage: String(body.giftMessage ?? ''), customerEmail: customer.email, customerPhone: customer.phone ?? '', customerId: customer.id,
    promoCode: body.promoCode ? String(body.promoCode) : undefined, promoDiscountMinor: Number(body.promoDiscountMinor ?? 0),
    giftCard: body.giftCardId ? { id: String(body.giftCardId), codeHash: String(body.giftCardCodeHash ?? ''), codeLast4: String(body.giftCardCodeLast4 ?? ''), amountAppliedMinor: Number(body.giftCardAmountAppliedMinor ?? 0), remainingTotalMinor: Number(body.giftCardRemainingTotalMinor ?? 0) } : undefined,
  }, { origin: getPublicOrigin(request) });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.error === 'plan_unavailable' || result.error === 'invalid_frequency' || result.error === 'invalid_bundle_size' || result.error === 'incomplete_destination' || result.error === 'lead_time' ? 400 : 409 });
  return NextResponse.json(result.value);
}
