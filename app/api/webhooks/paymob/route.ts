import { NextResponse } from 'next/server';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { getRequiredServerEnv } from '@/lib/server-env';
import { deliverOrderNotification } from '@/features/notifications/notification-delivery';
import { verifyPaymobCallback } from '@/features/payment/paymob-hmac';
import { buildPaymobIdempotencyKey, handlePaymobAmountMismatch } from '@/features/payment/paymob-webhook';
import { parsePaymobSpecialReference } from '@/features/payment/paymob-routing';
import { handleChangePaymentCallback } from '@/features/order-mutations/change-request-service';
import { activateGiftCardPurchase, settleGiftCardOrderPayment } from '@/features/gift-cards/service';
import { activateSubscriptionIfPaid } from '@/features/subscriptions/service';
import { sanitizePaymobPayload } from '@/features/payment/paymob-pii';
import { getPublicOrigin } from '@/lib/origin';
import { logger } from '@/lib/logger';
import { runInBackground } from '@/lib/wait-until';

// R-15: replay protection. A Paymob callback that passes HMAC verification is
// still a potential replay (MITM capture, log leak, or a Paymob retry of a
// captured payload). We reject any callback whose timestamp is stale and we
// record each (provider, provider_reference) in webhook_events so it can only
// ever be processed once.
const WEBHOOK_FRESHNESS_MS = 15 * 60 * 1000;

type SupabaseClient = ReturnType<typeof getAdminSupabase>;
type LedgerResult = 'inserted' | 'duplicate' | 'error';

// Paymob timestamps arrive either as an ISO string or a numeric unix value
// (seconds in some payloads, milliseconds in others). Normalize both.
function parsePaymobTimestamp(raw: unknown): Date | null {
  if (raw === undefined || raw === null || raw === '') return null;
  if (typeof raw === 'number' && !Number.isNaN(raw)) {
    return new Date(raw < 1e12 ? raw * 1000 : raw);
  }
  if (typeof raw === 'string' && raw.trim() !== '' && !Number.isNaN(Number(raw))) {
    const n = Number(raw);
    return new Date(n < 1e12 ? n * 1000 : n);
  }
  if (typeof raw === 'string' && raw.trim() !== '') {
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

// A read-only status poll carries no transaction/order id and no success flag,
// so freshness is irrelevant and we must not reject it.
function isBenignStatusQuery(tx: Record<string, any>): boolean {
  return tx.id === undefined && tx.order?.id === undefined && tx.success === undefined;
}

// Returns 'duplicate' if this (provider, reference) was already recorded
// (concurrent replays collide on the primary key and are treated the same),
// 'error' on any DB failure (caller returns 500), or 'inserted' on first sight.
async function recordWebhookEvent(client: SupabaseClient, providerReference: string, eventType: string): Promise<LedgerResult> {
  try {
    const { data: existing } = await client
      .from('webhook_events')
      .select('provider_reference')
      .eq('provider', 'paymob')
      .eq('provider_reference', providerReference)
      .maybeSingle();
    if (existing) return 'duplicate';
    // The SELECT above handles the common case; the composite primary key on
    // (provider, provider_reference) turns any concurrent replay collision into
    // a unique-violation error, which we treat identically to a duplicate.
    const { error } = await client
      .from('webhook_events')
      .insert({ provider: 'paymob', provider_reference: providerReference, event_type: eventType });
    if (error) return 'duplicate';
    return 'inserted';
  } catch {
    return 'error';
  }
}

export async function POST(request: Request) {
  // Paymob callbacks should never be large. Anything over 64KB is not a real
  // payment and we 400 immediately rather than exhausting the worker body limit.
  const contentLength = Number(request.headers.get('content-length') ?? '0');
  if (contentLength > 65_000) {
    logger.warn('payment.webhook.oversized', { contentLength });
    return NextResponse.json({ error: 'Payload too large' }, { status: 400 });
  }
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

  // R-15 replay protection: must run BEFORE any state change below.
  const ledgerReference = String(transaction.id ?? transaction.order?.id ?? '');
  if (ledgerReference) {
    const ts = parsePaymobTimestamp(transaction.created_at);
    const stale = ts !== null && Date.now() - ts.getTime() > WEBHOOK_FRESHNESS_MS;
    // Benign status queries carry no id/timestamp; never reject those.
    if (!isBenignStatusQuery(transaction) && stale) {
      logger.warn('payment.webhook.stale', { providerReference: ledgerReference, createdAt: ts?.toISOString() });
      return NextResponse.json({ received: true });
    }
    const eventType = typeof transaction.type === 'string' ? transaction.type : (transaction.success === true ? 'payment_success' : 'payment_failed');
    const ledger = await recordWebhookEvent(getAdminSupabase(), ledgerReference, eventType);
    if (ledger === 'error') {
      logger.error('payment.webhook.ledger_failed', { providerReference: ledgerReference });
      return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
    }
    if (ledger === 'duplicate') {
      logger.info('payment.webhook.duplicate', { providerReference: ledgerReference });
      return NextResponse.json({ received: true });
    }
  }

  const specialReference = String(transaction.order?.special_reference ?? transaction.special_reference ?? '');
  if (parsePaymobSpecialReference(specialReference)?.kind === 'giftcard') {
    try {
      await activateGiftCardPurchase(getAdminSupabase(), {
        specialReference,
        amountMinor: Number(transaction.amount_cents ?? 0),
        providerReference: String(transaction.id ?? transaction.order?.id ?? ''),
        success: transaction.success === true,
      });
      return NextResponse.json({ received: true });
    } catch (error) {
    logger.error('route.error', { scope: 'gift-card webhook', error });
      logger.error('payment.webhook.gift_card_failed', { specialReference, error });
      return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
    }
  }

  // Change-request delta payments: Paymob echoes special_reference back in the
  // callback. Match it before the order path — the order path matches
  // display_number and would 400 on these (no merchant_order_id is set).
  if (parsePaymobSpecialReference(specialReference)?.kind === 'change') {
    await handleChangePaymentCallback(getAdminSupabase(), transaction, { orderUrlBase: getPublicOrigin(request) });
    return NextResponse.json({ received: true });
  }

  const orderReference = String(transaction.merchant_order_id ?? transaction.order?.merchant_order_id ?? transaction.order?.id ?? '');
  const amountMinor = Number(transaction.amount_cents ?? 0);
  const success = transaction.success === true;
  const providerReference = String(transaction.id ?? transaction.order?.id ?? '');
  // Idempotency key is keyed on providerReference only. A success callback that
  // arrives after a failure (network split, 3DS void-then-capture) reuses the
  // same key and is treated as a state update, not a duplicate.
  const idempotencyKey = buildPaymobIdempotencyKey(providerReference);
  if (!orderReference || !providerReference) return NextResponse.json({ error: 'Incomplete callback' }, { status: 400 });

  const supabase = getAdminSupabase();

  // Quarantine a payload whose amount disagrees with the order total. Ack 2xx so
  // Paymob stops retrying; the row sits in webhook_quarantine for an operator.
  const { data: order } = await supabase.from('orders').select('id,total_minor,subtotal_minor,delivery_fee_minor,discount_minor,payment_status,display_number,public_token,customer_email,locale,gift_card_id,gift_card_minor,gift_card_hold_id,subscription_id').eq('display_number', orderReference).maybeSingle();
  if (!order) return NextResponse.json({ received: true });
  if (order.total_minor !== amountMinor) {
    await handlePaymobAmountMismatch({ client: supabase, provider: 'paymob', providerReference, orderReference, orderTotalMinor: order.total_minor, callbackAmountMinor: amountMinor, payload });
    logger.warn('payment.webhook.amount_mismatch', { orderReference, providerReference, orderAmount: order.total_minor, callbackAmount: amountMinor });
    return NextResponse.json({ received: true, quarantined: true });
  }

  try {
    const giftCardSettlement = await settleGiftCardOrderPayment(supabase, order, { success, providerReference });
    if (!giftCardSettlement.ok) throw new Error('Gift-card settlement failed');

    const desiredStatus = success ? 'paid' : 'payment_failed';
    const sanitizedPayload = sanitizePaymobPayload(payload);
    const { data: existing } = await supabase.from('payments').select('id,status').eq('provider_reference', providerReference).maybeSingle();
    if (existing) {
      if (existing.status !== desiredStatus) {
        await supabase.from('payments').update({ status: desiredStatus, raw_event: sanitizedPayload, updated_at: new Date().toISOString() }).eq('id', existing.id);
      }
    } else {
      const { error: insertError } = await supabase.from('payments').insert({ order_id: order.id, provider: 'paymob', provider_reference: providerReference, idempotency_key: idempotencyKey, amount_minor: amountMinor, currency: String(transaction.currency ?? 'EGP'), status: desiredStatus, raw_event: sanitizedPayload });
      if (insertError && !insertError.message.toLowerCase().includes('duplicate')) throw insertError;
    }

    // Allow pending, payment_started, and payment_failed to flip in either direction.
    // A late success after a recorded failure must still be honored.
    await supabase.from('orders').update({ payment_status: desiredStatus }).eq('id', order.id).in('payment_status', ['pending', 'payment_started', 'payment_failed']);
    await supabase.from('order_events').insert({ order_id: order.id, event_type: success ? 'payment_confirmed' : 'payment_failed', from_status: order.payment_status, to_status: desiredStatus, metadata: { providerReference } });
    if (success) {
      // Ack Paymob immediately; delivery rides ctx.waitUntil on Cloudflare and
      // is awaited in other runtimes (it is best-effort and never throws).
      void runInBackground(() => deliverOrderNotification(supabase, {
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
      }));
      if (order.subscription_id) {
        const activation = await activateSubscriptionIfPaid(supabase, String(order.subscription_id), { parentClient: supabase });
        if (activation === 'noop') logger.warn('payment.webhook.subscription_activation_failed', { orderReference, subscriptionId: String(order.subscription_id) });
      }
    }
    logger.info('payment.webhook.processed', { orderReference, providerReference, success, amountMinor });
    return NextResponse.json({ received: true });
  } catch (error) {
    logger.error('route.error', { scope: 'paymob webhook', error });
    logger.error('payment.webhook.failed', { orderReference, providerReference, error });
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}
