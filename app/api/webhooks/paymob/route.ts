import { NextResponse } from 'next/server';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { getRequiredServerEnv } from '@/lib/server-env';
import { deliverOrderNotification } from '@/features/notifications/notification-delivery';
import { verifyPaymobCallback } from '@/features/payment/paymob-hmac';
import { getPublicOrigin } from '@/lib/origin';
import { logRouteError } from '@/lib/api';

export async function POST(request: Request) {
  const payload = (await request.json()) as Record<string, unknown> & { hmac?: string; obj?: Record<string, unknown> };
  const transaction = (payload.obj ?? payload) as Record<string, any>;
  // Paymob delivers the HMAC as a query parameter on the callback URL (?hmac=), not in the body.
  const queryHmac = new URL(request.url).searchParams.get('hmac') ?? undefined;
  const callback = { ...transaction, hmac: payload.hmac ?? transaction.hmac ?? queryHmac };
  if (!verifyPaymobCallback(callback, getRequiredServerEnv('PAYMOB_HMAC_SECRET'))) return NextResponse.json({ error: 'Invalid callback signature' }, { status: 401 });

  const orderReference = String(transaction.merchant_order_id ?? transaction.order?.merchant_order_id ?? transaction.order?.id ?? '');
  const amountMinor = Number(transaction.amount_cents ?? 0);
  const success = transaction.success === true;
  const providerReference = String(transaction.id ?? transaction.order?.id ?? '');
  const idempotencyKey = `paymob:${providerReference}:${success ? 'success' : 'failure'}`;
  if (!orderReference || !providerReference) return NextResponse.json({ error: 'Incomplete callback' }, { status: 400 });

  try {
    const supabase = getAdminSupabase();
    const { data: order } = await supabase.from('orders').select('id,total_minor,subtotal_minor,delivery_fee_minor,discount_minor,payment_status,display_number,public_token,customer_email,locale').eq('display_number', orderReference).maybeSingle();
    if (!order) return NextResponse.json({ received: true });
    if (order.total_minor !== amountMinor) return NextResponse.json({ error: 'Amount mismatch' }, { status: 400 });

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
    return NextResponse.json({ received: true });
  } catch (error) {
    logRouteError('paymob webhook', error);
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}
