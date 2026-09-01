import { randomUUID } from 'node:crypto';
import { getOptionalServerEnv, getRequiredServerEnv } from '@/lib/server-env';
import { createPaymobIntention } from '@/features/payment/paymob-client';
import type { PaymentCustomer } from '@/features/payment/paymob-client';
import { generateGiftCardCode, hashGiftCardCode, encryptGiftCardCode, maskGiftCardCode } from '@/features/gift-cards/crypto';
import { sendSubscriptionEmail } from './email';
import { datesFrom } from './schedule';
import type { Frequency } from './types';
import { getPlanBySlug } from './repository';
import { validateSubscriptionCheckout } from './validation';
import { validatePromo, computeDiscount, type PromoRow } from '@/features/promo/apply';
import { fetchPromo } from '@/features/promo/repository';

type Client = { from: (table: string) => any; rpc: (name: string, args: Record<string, unknown>) => any };
type IntentionInput = { amountMinor: number; orderReference: string; customer: PaymentCustomer; notificationUrl: string; redirectionUrl: string };
type IntentionCreator = (input: IntentionInput) => Promise<{ checkoutUrl: string }>;

/**
 * Server-side discount recompute for a subscription checkout (R-01).
 *
 * The client may send `promoDiscountMinor`, but that value is NEVER trusted.
 * The real discount comes only from a promo that the server loads and
 * validates. Returns 0 when there is no promo code, no matching/active promo,
 * or when the promo fails validation.
 */
export function computeSubscriptionDiscount(params: {
  promoCode?: string;
  /** Client-supplied, untrusted — explicitly ignored. */
  promoDiscountMinor?: number;
  resolvedPromo: PromoRow | null;
  subtotalMinor: number;
  now: Date;
}): number {
  void params.promoDiscountMinor; // client value is not used for computation
  if (!params.promoCode || !params.resolvedPromo) return 0;
  if (validatePromo(params.resolvedPromo, params.subtotalMinor, params.now)) return 0;
  return computeDiscount(params.resolvedPromo, params.subtotalMinor).discountMinor;
}

/** Clamp discount to the subtotal and subtract applied gift card (EGP minor units). */
export function computeSubscriptionTotals(
  subtotalMinor: number,
  discountMinor: number,
  giftCardMinor: number,
): { discountMinor: number; totalMinor: number } {
  const safeDiscount = Math.max(0, Math.min(discountMinor, subtotalMinor));
  return { discountMinor: safeDiscount, totalMinor: Math.max(0, subtotalMinor - safeDiscount - giftCardMinor) };
}

export type CreateSubscriptionResult =
  | { ok: true; value: { orderId: string; subscriptionId: string; publicToken: string; displayNumber: string; paymentStatus: string; checkoutUrl: string | null } }
  | { ok: false; error: string };

/**
 * Resolve the cheapest active variant for a plan's product.
 *
 * `product_variants` carries no `slug` and no `price_minor` — its columns are
 * `id, product_id, name_en, name_ar, name_fr, price_delta_minor, active`
 * (supabase/migrations/001_commerce.sql:36-43, name_fr added in 003). Price lives
 * on `products`; a variant only contributes a delta. Selecting `slug`/`price_minor`
 * here made PostgREST error and took subscription checkout down entirely.
 */
async function resolveProductVariant(client: Client, productId: string) {
  const { data: product, error: productError } = await client.from('products')
    .select('slug,name_en,name_ar,name_fr,price_minor')
    .eq('id', productId).maybeSingle();
  if (productError || !product) throw new Error('PRODUCT_VARIANT_NOT_FOUND');

  const { data: variant, error: variantError } = await client.from('product_variants')
    .select('id,name_en,name_ar,name_fr,price_delta_minor')
    .eq('product_id', productId).eq('active', true)
    .order('price_delta_minor', { ascending: true }).limit(1).maybeSingle();
  if (variantError || !variant) throw new Error('PRODUCT_VARIANT_NOT_FOUND');

  // Variant names default to '' (001) and name_fr has no default (003), so fall
  // back to the product name rather than storing a blank order line.
  const pick = (variantValue: unknown, productValue: unknown) =>
    String((variantValue ?? '').toString().trim() || productValue || '');

  return {
    variantId: String(variant.id),
    slug: String(product.slug),
    nameEn: pick(variant.name_en, product.name_en),
    nameAr: pick(variant.name_ar, product.name_ar),
    nameFr: pick(variant.name_fr, product.name_fr ?? product.name_en),
    priceMinor: Number(product.price_minor ?? 0) + Number(variant.price_delta_minor ?? 0),
  };
}

const defaultCreateIntention: IntentionCreator = (input) => createPaymobIntention({ ...input, integrationId: Number(getRequiredServerEnv('PAYMOB_INTEGRATION_ID')) });

export async function createSubscription(
  client: Client,
  input: { slug: string; frequency: Frequency; bundleSize: number; recipientName: string; recipientPhone: string; deliveryAddress: string; cityCode: string; deliveryWindow: string; deliveryDate: string; locale: 'en' | 'ar' | 'fr'; giftMessage: string; customerEmail: string; customerPhone: string; customerId: string; promoCode?: string; promoDiscountMinor?: number; giftCard?: { id: string; codeHash: string; codeLast4: string; amountAppliedMinor: number; remainingTotalMinor: number } },
  deps: { origin: string; now?: Date; createIntention?: IntentionCreator },
): Promise<CreateSubscriptionResult> {
  const c = client;
  const plan = await getPlanBySlug(client, input.slug);
  if (!plan) return { ok: false, error: 'plan_unavailable' };
  const validation = validateSubscriptionCheckout(plan, input, deps.now ?? new Date());
  if (!validation.ok) return { ok: false, error: validation.error };
  const v = validation.value;
  if (v.giftCardMinor && v.giftCardMinor > 0 && !input.giftCard) return { ok: false, error: 'invalid_gift_card' };
  const subtotalMinor = v.priceMinor;
  const giftCardMinor = v.giftCardMinor ?? 0;
  // SECURITY (R-01): never trust the client-supplied `promoDiscountMinor`.
  // Recompute the discount from a server-validated promo only.
  const resolvedPromo = input.promoCode ? await fetchPromo(client, input.promoCode) : null;
  const discountMinor = computeSubscriptionDiscount({
    promoCode: input.promoCode,
    promoDiscountMinor: input.promoDiscountMinor,
    resolvedPromo,
    subtotalMinor,
    now: deps.now ?? new Date(),
  });
  const totalMinor = computeSubscriptionTotals(subtotalMinor, discountMinor, giftCardMinor).totalMinor;
  const variant = await resolveProductVariant(client, plan.productId);
  const line = { productSlug: variant.slug, productName: variant.nameEn, productNameAr: variant.nameAr, productNameFr: variant.nameFr, unitPrice: subtotalMinor, quantity: 1, addOns: [], message: String(input.giftMessage || '') };
  const payload = {
    customerId: input.customerId, customerEmail: input.customerEmail, customerPhone: input.customerPhone,
    recipientName: String(input.recipientName), recipientPhone: String(input.recipientPhone), deliveryAddress: String(input.deliveryAddress),
    cityCode: input.cityCode, deliveryWindow: input.deliveryWindow, deliveryDate: input.deliveryDate,
    locale: input.locale, frequency: input.frequency, bundleSize: input.bundleSize,
    planId: plan.id, productId: plan.productId, variantId: variant.variantId, giftMessage: String(input.giftMessage),
    promoCode: input.promoCode || null, subtotalMinor, discountMinor, giftCardMinor: v.giftCardMinor ?? 0, totalMinor,
    giftCardId: input.giftCard?.id ?? null, giftCardCodeHash: input.giftCard?.codeHash ?? null, giftCardCodeLast4: input.giftCard?.codeLast4 ?? null,
  };
  const { data, error } = await c.rpc('create_subscription_order', { p_checkout: payload, p_lines: [line] });
  if (error) return { ok: false, error: 'unavailable' };
  const order = data?.order ?? {};
  const subscriptionId = String(data?.subscription_id);
  const paymobConfigured = Boolean(getOptionalServerEnv('PAYMOB_API_KEY') && getOptionalServerEnv('PAYMOB_PUBLIC_KEY') && getOptionalServerEnv('PAYMOB_INTEGRATION_ID') && getOptionalServerEnv('PAYMOB_HMAC_SECRET'));
  if (order.total_minor === 0 || !paymobConfigured) {
    await activateSubscriptionIfPaid(client, subscriptionId, { parentClient: client });
    return { ok: true, value: { orderId: String(order.id), subscriptionId, publicToken: String(order.public_token), displayNumber: String(order.display_number), paymentStatus: 'paid', checkoutUrl: null } };
  }
  try {
    const intention = deps.createIntention ?? defaultCreateIntention;
    const payment = await intention({
      amountMinor: Number(order.total_minor), orderReference: String(order.display_number),
      customer: { name: String(input.recipientName), email: input.customerEmail, phone: String(input.recipientPhone) },
      notificationUrl: `${deps.origin.replace(/\/$/, '')}/api/webhooks/paymob`,
      redirectionUrl: `${deps.origin.replace(/\/$/, '')}/${input.locale}/cairo/orders/${order.id}?token=${encodeURIComponent(String(order.public_token))}`,
    });
    return { ok: true, value: { orderId: String(order.id), subscriptionId, publicToken: String(order.public_token), displayNumber: String(order.display_number), paymentStatus: 'payment_started', checkoutUrl: payment.checkoutUrl } };
  } catch {
    return { ok: false, error: 'unavailable' };
  }
}

export async function activateSubscriptionIfPaid(client: Client, subscriptionId: string, deps: { parentClient?: Client } = {}): Promise<'activated' | 'already_active' | 'not_found' | 'noop'> {
  const c = deps.parentClient ?? client;
  const { data: sub } = await c.from('subscriptions').select('id,status,frequency,first_delivery_date,bundle_size').eq('id', subscriptionId).maybeSingle();
  if (!sub) return 'not_found';
  if (sub.status === 'active') return 'already_active';
  if (sub.status !== 'pending_payment') return 'noop';
  const dates = datesFrom(String(sub.first_delivery_date), sub.frequency as Frequency, Number(sub.bundle_size));
  const { error } = await c.rpc('activate_subscription', { p_subscription_id: subscriptionId, p_dates: dates });
  return error ? 'noop' : 'activated';
}

export type CancelResult = { ok: true; creditMinor: number; giftCardCodeLast4: string | null } | { ok: false; error: 'not_found' | 'already_cancelled' | 'unavailable' };

export async function cancelSubscriptionWithCredit(
  client: Client, subscriptionId: string, customerId: string,
  opts: { actor: 'customer' | 'admin'; actorId?: string | null },
  deps: { now?: Date } = {},
): Promise<CancelResult> {
  const c = client;
  const { data: owned } = await c.from('subscriptions')
    .select('id,price_minor,bundle_size,frequency,locale,recipient_email,customer_id,subscription_plans(name_en)')
    .eq('id', subscriptionId).eq('customer_id', customerId).maybeSingle();
  if (!owned) return { ok: false, error: 'not_found' };
  const { data: cancelData, error: cancelError } = await c.rpc('cancel_subscription', { p_subscription_id: subscriptionId });
  if (cancelError) return { ok: false, error: 'unavailable' };
  if (!cancelData?.cancelled) return { ok: false, error: 'already_cancelled' };

  const unmaterialized = Number(cancelData.unmaterialized_count ?? 0);
  const bundleSize = Number(owned.bundle_size);
  const priceMinor = Number(owned.price_minor);
  const creditMinor = bundleSize > 0 ? Math.floor((priceMinor * unmaterialized) / bundleSize) : 0;
  let giftCardCodeLast4: string | null = null;

  if (creditMinor > 0) {
    const now = deps.now ?? new Date();
    const secret = getRequiredServerEnv('GIFT_CARD_SECRET');
    const code = generateGiftCardCode();
    const purchaseId = randomUUID();
    const cardId = randomUUID();
    const expiresAt = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000).toISOString();
    const buyerEmail = String(owned.recipient_email ?? '').trim();
    const planName = String(owned.subscription_plans?.name_en ?? '');
    const row = {
      id: cardId, purchase_id: purchaseId, code_hash: hashGiftCardCode(code, secret), code_ciphertext: encryptGiftCardCode(code, secret),
      code_last4: code.replace(/-/g, '').slice(-4), initial_balance_minor: creditMinor, balance_minor: creditMinor,
      recipient_name: planName, recipient_email: buyerEmail, buyer_email: buyerEmail, status: 'active', locale: owned.locale ?? 'en',
      expires_at: expiresAt, delivery_status: 'sent', delivery_attempts: 1, activated_at: now.toISOString(), created_at: now.toISOString(),
    };
    const { error: cardError } = await c.from('gift_cards').insert(row);
    if (cardError) return { ok: false, error: 'unavailable' };
    await c.from('gift_card_purchases').insert({
      id: purchaseId, reference: `SUBREF-${subscriptionId}`, amount_minor: creditMinor, currency: 'EGP',
      sender_name: planName, sender_email: buyerEmail, recipient_name: planName, recipient_email: buyerEmail,
      message: 'Store credit from subscription cancellation', locale: owned.locale ?? 'en',
      status: 'paid', source: 'subscription_refund', delivery_status: 'sent', delivery_attempts: 1,
    });
    await c.from('gift_card_transactions').insert({
      gift_card_id: cardId, type: 'issue', amount_minor: creditMinor, actor_id: opts.actorId ?? null,
      idempotency_key: `subscription-refund:${subscriptionId}`, metadata: { source: 'subscription_refund' },
    });
    giftCardCodeLast4 = maskGiftCardCode(code);
    await c.from('subscription_events').insert({
      subscription_id: subscriptionId, actor: opts.actor, actor_id: opts.actorId ?? null,
      event_type: 'credit_issued', payload: { credit_minor: creditMinor, plan_name: planName },
    });
    if (buyerEmail) {
      const locale = (owned.locale === 'ar' || owned.locale === 'fr' ? owned.locale : 'en') as 'en' | 'ar' | 'fr';
      await sendSubscriptionEmail({ type: 'cancelled_credit', to: buyerEmail, locale, planName, code, creditMinor }).catch(() => {});
    }
  }
  return { ok: true, creditMinor, giftCardCodeLast4 };
}
