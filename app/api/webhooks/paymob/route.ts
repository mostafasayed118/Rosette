import { NextResponse } from 'next/server';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { getRequiredServerEnv } from '@/lib/server-env';
import { deliverOrderNotification } from '@/features/notifications/notification-delivery';
import { verifyPaymobCallback } from '@/features/payment/paymob-hmac';
import { handleChangePaymentCallback } from '@/features/orders/change-request-service';
import { activateGiftCardPurchase, settleGiftCardOrderPayment } from '@/features/gift-cards/service';
import { getPublicOrigin } from '@/lib/origin';
import { logRouteError } from '@/lib/api';
import { logger } from '@/lib/logger';

export async function POST(request: Request) {
  let payload: Record<string, unknown> & { hmac?: string; obj?: Record<string, unknown> };
  try {
    payload = (await request.json()) as Record<string, unknown> & { hmac?: string; obj?: Record<string, unknown> };
  } catch {
    logger.warn('payment.webhook.malformed_body');
    return NextResponse.json({ error: 'Malformed callback body' }, { status: 400 });
  }
  const transaction = (payload.obj ?? payload) as Record<string, any>;
  // Paymob delivers the HMAC as a query parameter on the callback URL (?hmac=);
  // prefer it over any body-supplied value.
  const queryHmac = new URL(request.url).searchParams.get('hmac') ?? undefined;
  const callback = { ...transaction, hmac: queryHmac ?? payload.hmac ?? transaction.hmac };
  if (!verifyPaymobCallback(callback, getRequiredServerEnv('PAYMOB_HMAC_SECRET'))) {
    logger.warn('payment.webhook.invalid_signature', { providerReference: String(transaction.id ?? '') });
    return NextResponse.json({ error: 'Invalid callback signature' }, { status: 401 });
  }
  logger.info('payment.webhook.received', { providerReference: String(transaction.id ?? ''), success: transaction.success === true });

  // Refund callbacks must never be treated as payments: they would insert a bogus
  // payments row and flip the order's payment_status from 'refunded' back to 'paid'.
  // The approval flow already refunds synchronously and records the result itself.
  if (transaction.is_refund === true || transaction.is_refunded === true || transaction.has_parent_transaction === true) return NextResponse.json({ received: true });

  const specialReference = String(transaction.order?.special_reference ?? transaction.special_reference ?? '');
  if (specialReference.startsWith('giftcard:')) {
    try {
      await activateGiftCardPurchase(getAdminSupabase(), {
        specialReference,
        amountMinor: Number(transaction.amount_cents ?? 0),
        providerReference: String(transaction.id ?? transaction.order?.id ?? ''),
        success: transaction.success === true,
      });
      return NextResponse.json({ received: true });
    } catch (error) {
      logRouteError('gift-card webhook', error);
      logger.error('payment.webhook.gift_card_failed', { specialReference, error });
      return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
    }
  }

  // Change-request delta payments: Paymob echoes special_reference back in the
  // callback. Match it before the order path — the order path matches
  // display_number and would 400 on these (no merchant_order_id is set).
  if (specialReference.startsWith('change:')) {
    await handleChangePaymentCallback(getAdminSupabase(), transaction, { orderUrlBase: getPublicOrigin(request) });
    return NextResponse.json({ received: true });
  }

  const orderReference = String(transaction.merchant_order_id ?? transaction.order?.merchant_order_id ?? transaction.order?.id ?? '');
  const amountMinor = Number(transaction.amount_cents ?? 0);
  const success = transaction.success === true;
  const providerReference = String(transaction.id ?? transaction.order?.id ?? '');
  const idempotencyKey = `paymob:${providerReference}:${success ? 'success' : 'failure'}`;
  if (!orderReference || !providerReference) return NextResponse.json({ error: 'Incomplete callback' }, { status: 400 });

  try {
    const supabase = getAdminSupabase();
    const { data: order } = await supabase.from('orders').select('id,total_minor,subtotal_minor,delivery_fee_minor,discount_minor,payment_status,display_number,public_token,customer_email,locale,gift_card_id,gift_card_minor,gift_card_hold_id').eq('display_number', orderReference).maybeSingle();
    if (!order) return NextResponse.json({ received: true });
    if (order.total_minor !== amountMinor) return NextResponse.json({ error: 'Amount mismatch' }, { status: 400 });
    const giftCardSettlement = await settleGiftCardOrderPayment(supabase, order, { success, providerReference });
    if (!giftCardSettlement.ok) throw new Error('Gift-card settlement failed');

    const { data: inserted, error: insertError } = await supabase.from('payments').insert({ order_id: order.id, provider: 'paymob', provider_reference: providerReference, idempotency_key: idempotencyKey, amount_minor: amountMinor, currency: String(transaction.currency ?? 'EGP'), status: success ? 'paid' : 'payment_failed', raw_event: payload }).select('id').maybeSingle();
    if (insertError && !insertError.message.toLowerCase().includes('duplicate')) throw insertError;
    if (!inserted && insertError) return NextResponse.json({ received: true });

    await supabase.from('orders').update({ payment_status: success ? 'paid' : 'payment_failed' }).eq('id', order.id).in('payment_status', ['pending', 'payment_started']);
    await supabase.from('order_events').insert({ order_id: order.id, event_type: success ? 'payment_confirmed' : 'payment_failed', from_status: order.payment_status, to_status: success ? 'paid' : 'payment_failed', metadata: { providerReference } });
    if (success) {
      await deliverOrderNotification(supabase, {
        orderId: order.id,
        type: 'payment_confirmed',
        recipient: order.customer_email ?? '',
        locale: order.locale === 'ar' || order.locale === 'fr' ? order.locale : 'en',
        orderNumber: order.display_number,
        totalMinor: order.total_minor,
        subtotalMinor: order.subtotal_minor,
        deliveryFeeMinor: order.delivery_fee_minor,
        discountMinor: order.discount_minor ?? undefined,
        orderUrl: `${getPublicOrigin(request)}/orders/${order.id}?token=${encodeURIComponent(order.public_token)}`,
      });
    }
    logger.info('payment.webhook.processed', { orderReference, providerReference, success, amountMinor });
    return NextResponse.json({ received: true });
  } catch (error) {
    logRouteError('paymob webhook', error);
    logger.error('payment.webhook.failed', { orderReference, providerReference, error });
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}
