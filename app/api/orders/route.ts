import { NextResponse } from 'next/server';
import { getOrderRepository } from '@/features/order/provider';
import { validateOrderRequest } from '@/features/order/order-request';
import { createPaymobIntention } from '@/features/payment/paymob-client';
import { getOptionalServerEnv, getRequiredServerEnv } from '@/lib/server-env';
import { getPublicOrigin } from '@/lib/origin';
import { getCurrentCustomer } from '@/features/auth/customer';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { deliverOrderNotification } from '@/features/notifications/notification-delivery';
import { markCartConverted } from '@/features/cart/cart-sync';
import { resolvePaymentMethodAvailability } from '@/features/checkout/payment-mode';
import { logRouteError } from '@/lib/api';

export async function POST(request: Request) {
  try {
    const body = await request.json() as { cart?: unknown; destination?: unknown; checkout?: unknown; locale?: unknown };
    const validation = validateOrderRequest(body as { cart?: { lines?: unknown[] }; total?: unknown });
    if (!validation.ok) return NextResponse.json({ error: validation.error }, { status: 400 });
    if (!body.destination || !body.checkout || (body.locale !== 'ar' && body.locale !== 'en' && body.locale !== 'fr')) return NextResponse.json({ error: 'Incomplete checkout details' }, { status: 400 });

    const checkoutPayment = (body.checkout as { paymentMethod?: string }).paymentMethod;
    const paymentPath = resolvePaymentMethodAvailability((checkoutPayment as 'paymob' | 'pay-on-delivery' | 'demo-card') ?? 'pay-on-delivery');
    if (!paymentPath.allowed) return NextResponse.json({ error: 'Payment method unavailable' }, { status: 409 });

    const customer = await getCurrentCustomer();
    const result = await getOrderRepository().createPending({ cart: body.cart as never, destination: body.destination as never, checkout: body.checkout as never, locale: body.locale, customerId: customer?.id ?? null });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.error === 'invalid_promo' || result.error === 'invalid_gift_card' ? 400 : 409 });
    const order = result.value;
    const checkout = body.checkout as { senderEmail: string; recipientPhone: string; recipientName: string };
    await deliverOrderNotification(getAdminSupabase(), {
      orderId: order.id,
      type: 'order_received',
      recipient: checkout.senderEmail,
      locale: body.locale,
      orderNumber: order.displayNumber,
      totalMinor: order.totalMinor,
      subtotalMinor: order.subtotalMinor,
      deliveryFeeMinor: order.deliveryFeeMinor,
      discountMinor: order.discountMinor,
      orderUrl: `${getPublicOrigin(request)}/orders/${order.id}?token=${encodeURIComponent(order.publicToken ?? '')}`,
    });
    // Best-effort: an order must never fail because a cart could not be marked.
    await markCartConverted(getAdminSupabase(), { email: checkout.senderEmail });
    if (order.totalMinor === 0 && order.giftCardHoldId) {
      const supabase = getAdminSupabase();
      const { error: redeemError } = await supabase.rpc('redeem_gift_card_hold', { p_hold_id: order.giftCardHoldId, p_idempotency_key: `gift-card-zero:${order.id}` });
      if (redeemError) return NextResponse.json({ error: 'Checkout is temporarily unavailable.' }, { status: 503 });
      await supabase.from('orders').update({ payment_status: 'paid', updated_at: new Date().toISOString() }).eq('id', order.id);
      await supabase.from('payments').insert({ order_id: order.id, provider: 'gift_card', provider_reference: null, idempotency_key: `gift-card-zero-payment:${order.id}`, amount_minor: 0, currency: 'EGP', status: 'paid' });
      await deliverOrderNotification(supabase, { orderId: order.id, type: 'payment_confirmed', recipient: checkout.senderEmail, locale: body.locale, orderNumber: order.displayNumber, totalMinor: 0, subtotalMinor: order.subtotalMinor, deliveryFeeMinor: order.deliveryFeeMinor, discountMinor: order.discountMinor, orderUrl: `${getPublicOrigin(request)}/orders/${order.id}?token=${encodeURIComponent(order.publicToken ?? '')}` });
      return NextResponse.json({ orderId: order.id, publicToken: order.publicToken, displayNumber: order.displayNumber, paymentStatus: 'paid', checkoutUrl: null });
    }
    const paymobConfigured = Boolean(getOptionalServerEnv('PAYMOB_API_KEY') && getOptionalServerEnv('PAYMOB_PUBLIC_KEY') && getOptionalServerEnv('PAYMOB_INTEGRATION_ID') && getOptionalServerEnv('PAYMOB_HMAC_SECRET'));
    if (!paymobConfigured) {
      if (order.giftCardHoldId) await getAdminSupabase().rpc('release_gift_card_hold', { p_hold_id: order.giftCardHoldId, p_idempotency_key: `gift-card-release:${order.id}` });
      return NextResponse.json({ orderId: order.id, publicToken: order.publicToken, displayNumber: order.displayNumber, paymentStatus: order.paymentStatus, checkoutUrl: null });
    }

    const origin = getPublicOrigin(request);
    let payment: Awaited<ReturnType<typeof createPaymobIntention>>;
    try {
      payment = await createPaymobIntention({
        amountMinor: order.totalMinor,
        orderReference: order.displayNumber,
        integrationId: Number(getRequiredServerEnv('PAYMOB_INTEGRATION_ID')),
        customer: { name: checkout.recipientName, email: checkout.senderEmail, phone: checkout.recipientPhone },
        notificationUrl: `${origin}/api/webhooks/paymob`,
        redirectionUrl: `${origin}/orders/${order.id}?token=${encodeURIComponent(order.publicToken ?? '')}`,
      });
    } catch (error) {
      if (order.giftCardHoldId) await getAdminSupabase().rpc('release_gift_card_hold', { p_hold_id: order.giftCardHoldId, p_idempotency_key: `gift-card-release:${order.id}` });
      throw error;
    }
    return NextResponse.json({ orderId: order.id, publicToken: order.publicToken, displayNumber: order.displayNumber, paymentStatus: 'payment_started', checkoutUrl: payment.checkoutUrl });
  } catch (error) {
    logRouteError('order creation', error);
    return NextResponse.json({ error: 'Checkout is temporarily unavailable.' }, { status: 503 });
  }
}
