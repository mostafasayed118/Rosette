import { NextResponse } from 'next/server';
import { getOrderRepository } from '@/features/order/provider';
import { validateOrderRequest } from '@/features/order/order-request';
import { createPaymobIntention } from '@/features/payment/paymob-client';
import { getOptionalServerEnv, getRequiredServerEnv } from '@/lib/server-env';
import { getPublicOrigin } from '@/lib/origin';
import { getCurrentCustomer } from '@/features/auth/customer';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { deliverOrderNotification } from '@/features/notifications/notification-delivery';
import { logRouteError } from '@/lib/api';

export async function POST(request: Request) {
  try {
    const body = await request.json() as { cart?: unknown; destination?: unknown; checkout?: unknown; locale?: unknown };
    const validation = validateOrderRequest(body as { cart?: { lines?: unknown[] }; total?: unknown });
    if (!validation.ok) return NextResponse.json({ error: validation.error }, { status: 400 });
    if (!body.destination || !body.checkout || (body.locale !== 'ar' && body.locale !== 'en' && body.locale !== 'fr')) return NextResponse.json({ error: 'Incomplete checkout details' }, { status: 400 });

    const customer = await getCurrentCustomer();
    const result = await getOrderRepository().createPending({ cart: body.cart as never, destination: body.destination as never, checkout: body.checkout as never, locale: body.locale, customerId: customer?.id ?? null });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.error === 'invalid_promo' ? 400 : 409 });
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
    const paymobConfigured = Boolean(getOptionalServerEnv('PAYMOB_API_KEY') && getOptionalServerEnv('PAYMOB_PUBLIC_KEY') && getOptionalServerEnv('PAYMOB_INTEGRATION_ID') && getOptionalServerEnv('PAYMOB_HMAC_SECRET'));
    if (!paymobConfigured) return NextResponse.json({ orderId: order.id, publicToken: order.publicToken, displayNumber: order.displayNumber, paymentStatus: order.paymentStatus, checkoutUrl: null });

    const origin = getPublicOrigin(request);
    const payment = await createPaymobIntention({
      amountMinor: order.totalMinor,
      orderReference: order.displayNumber,
      integrationId: Number(getRequiredServerEnv('PAYMOB_INTEGRATION_ID')),
      customer: { name: checkout.recipientName, email: checkout.senderEmail, phone: checkout.recipientPhone },
      notificationUrl: `${origin}/api/webhooks/paymob`,
      redirectionUrl: `${origin}/orders/${order.id}?token=${encodeURIComponent(order.publicToken ?? '')}`,
    });
    return NextResponse.json({ orderId: order.id, publicToken: order.publicToken, displayNumber: order.displayNumber, paymentStatus: 'payment_started', checkoutUrl: payment.checkoutUrl });
  } catch (error) {
    logRouteError('order creation', error);
    return NextResponse.json({ error: 'Checkout is temporarily unavailable.' }, { status: 503 });
  }
}
