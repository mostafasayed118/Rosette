import { randomUUID } from 'node:crypto';
import { getRequiredServerEnv } from '@/lib/server-env';
import { createPaymobIntention } from '@/features/payment/paymob-client';
import type { PaymentCustomer } from '@/features/payment/types';
import { decryptGiftCardCode, encryptGiftCardCode, generateGiftCardCode, hashGiftCardCode, maskGiftCardCode } from './crypto';
import type { GiftCardPurchaseInput, GiftCardQuote } from './types';
import { validateGiftCardPurchaseInput } from './validation';
import { renderGiftCardEmail, sendGiftCardEmail } from './purchase-email';

export type GiftCardClient = { from: (table: string) => any; rpc?: (name: string, args: Record<string, unknown>) => any };
type GiftCardRpcClient = { rpc?: (name: string, args: Record<string, unknown>) => any };
type GiftCardIntentionInput = { amountMinor: number; orderReference: string; specialReference: string; customer: PaymentCustomer; notificationUrl: string; redirectionUrl: string };
type GiftCardIntentionCreator = (input: GiftCardIntentionInput) => Promise<{ providerReference: string; checkoutUrl: string }>;
type DeliveryInput = { recipient: string; code: string; purchase: Record<string, unknown> };
type DeliveryStatus = 'sent' | 'failed';

async function claimGiftCardDelivery(client: GiftCardClient, cardId: string, now: Date): Promise<string | null> {
  if (!client.rpc) return null;
  const claimToken = randomUUID();
  try {
    const { data, error } = await client.rpc('claim_gift_card_delivery', {
      p_card_id: cardId,
      p_claim_token: claimToken,
      p_now: now.toISOString(),
    });
    return error || data !== true ? null : claimToken;
  } catch {
    return null;
  }
}

async function completeGiftCardDelivery(client: GiftCardClient, cardId: string, claimToken: string, status: DeliveryStatus, errorMessage: string | null): Promise<boolean> {
  if (!client.rpc) return false;
  try {
    const { data, error } = await client.rpc('complete_gift_card_delivery', {
      p_card_id: cardId,
      p_claim_token: claimToken,
      p_status: status,
      p_error: errorMessage,
    });
    return !error && data === true;
  } catch {
    return false;
  }
}

function defaultCreateIntention(input: GiftCardIntentionInput) {
  return createPaymobIntention({ ...input, integrationId: Number(getRequiredServerEnv('PAYMOB_INTEGRATION_ID')) });
}

export async function createGiftCardPurchase(
  client: GiftCardClient,
  input: GiftCardPurchaseInput,
  deps: { origin: string; createIntention?: GiftCardIntentionCreator },
): Promise<{ ok: true; value: { purchaseId: string; reference: string; checkoutUrl: string } } | { ok: false; error: 'invalid_input' | 'unavailable' }> {
  const validation = validateGiftCardPurchaseInput(input);
  if (!validation.ok) return { ok: false, error: validation.error === 'invalid_amount' ? 'invalid_input' : validation.error };
  const value = validation.value;
  const purchaseId = randomUUID();
  const reference = `GC-${purchaseId}`;
  const { error } = await client.from('gift_card_purchases').insert({ id: purchaseId, reference, amount_minor: value.amountMinor, currency: 'EGP', sender_name: value.senderName, sender_email: value.senderEmail, recipient_name: value.recipientName, recipient_email: value.recipientEmail, message: value.message, locale: value.locale, status: 'pending', delivery_status: 'pending' });
  if (error) return { ok: false, error: 'unavailable' };
  try {
    const payment = await (deps.createIntention ?? defaultCreateIntention)({
      amountMinor: value.amountMinor,
      orderReference: reference,
      specialReference: `giftcard:${purchaseId}`,
      customer: { name: value.senderName, email: value.senderEmail, phone: 'NA' },
      notificationUrl: `${deps.origin.replace(/\/$/, '')}/api/webhooks/paymob`,
      redirectionUrl: `${deps.origin.replace(/\/$/, '')}/gift-cards/result?reference=${encodeURIComponent(reference)}&locale=${value.locale}`,
    });
    return { ok: true, value: { purchaseId, reference, checkoutUrl: payment.checkoutUrl } };
  } catch {
    await client.from('gift_card_purchases').update({ status: 'failed', updated_at: new Date().toISOString() }).eq('id', purchaseId);
    return { ok: false, error: 'unavailable' };
  }
}

async function recoverGiftCardActivation(
  client: GiftCardClient,
  purchase: Record<string, any>,
  card: Record<string, any>,
  providerReference: string,
  deps: { secret: string; now: Date; deliver: (input: DeliveryInput) => Promise<boolean> },
): Promise<{ handled: true; status: 'activated' }> {
  // Backfill the issue ledger row idempotently: a prior attempt may have crashed
  // between the card insert and the issue-transaction insert.
  await client.from('gift_card_transactions').upsert(
    { gift_card_id: String(card.id), type: 'issue', amount_minor: Number(purchase.amount_minor), idempotency_key: `gift-card-issue:${purchase.id}`, metadata: { provider_reference: providerReference } },
    { onConflict: 'idempotency_key' },
  );
  await client.from('gift_card_purchases').update({ status: 'paid', provider_reference: providerReference, updated_at: deps.now.toISOString() }).eq('id', purchase.id);

  // Re-deliver only when the card has never been delivered; a crash between the
  // card insert and delivery leaves it pending.
  if (card.delivery_status === 'pending') {
    const claimToken = await claimGiftCardDelivery(client, String(card.id), deps.now);
    if (!claimToken) return { handled: true, status: 'activated' };

    const recipients = [...new Set([String(purchase.sender_email).trim().toLowerCase(), String(purchase.recipient_email).trim().toLowerCase()])].filter(Boolean);
    let code: string | null = null;
    try {
      code = decryptGiftCardCode(String(card.code_ciphertext), deps.secret);
    } catch {
      code = null;
    }
    let failed = code === null ? 1 : 0;
    if (code !== null) {
      const expiresAt = String(card.expires_at ?? new Date(deps.now.getTime() + 365 * 24 * 60 * 60 * 1000).toISOString());
      for (const recipient of recipients) if (!(await deps.deliver({ recipient, code, purchase: { ...purchase, expires_at: expiresAt } }))) failed += 1;
    }
    const deliveryStatus: DeliveryStatus = failed ? 'failed' : 'sent';
    const deliveryError = failed ? 'smtp_failed' : null;
    const completed = await completeGiftCardDelivery(client, String(card.id), claimToken, deliveryStatus, deliveryError);
    if (completed) {
      const deliveryState = { delivery_status: deliveryStatus, delivery_attempts: Number(card.delivery_attempts ?? 0) + 1, last_delivery_error: deliveryError };
      await client.from('gift_card_purchases').update(deliveryState).eq('id', purchase.id);
    }
  }
  return { handled: true, status: 'activated' };
}

export async function activateGiftCardPurchase(
  client: GiftCardClient,
  transaction: { specialReference: string; amountMinor: number; providerReference: string; success: boolean },
  deps: { secret?: string; now?: Date; deliver?: (input: DeliveryInput) => Promise<boolean> } = {},
): Promise<{ handled: true; status: 'activated' | 'already_processed' | 'failed' | 'ignored' }> {
  if (!transaction.specialReference.startsWith('giftcard:')) return { handled: true, status: 'ignored' };
  const reference = transaction.specialReference.slice('giftcard:'.length);
  if (!reference) return { handled: true, status: 'ignored' };
  const { data: purchase } = await client.from('gift_card_purchases').select('*').eq('id', reference).maybeSingle();
  if (!purchase) return { handled: true, status: 'ignored' };
  if (purchase.status === 'paid') return { handled: true, status: 'already_processed' };
  if (!transaction.success || Number(purchase.amount_minor) !== transaction.amountMinor) {
    await client.from('gift_card_purchases').update({ status: 'failed', updated_at: new Date().toISOString() }).eq('id', purchase.id);
    return { handled: true, status: 'failed' };
  }

  const now = deps.now ?? new Date();
  const secret = deps.secret ?? getRequiredServerEnv('GIFT_CARD_SECRET');

  const deliver = deps.deliver ?? (async ({ recipient, code: deliveryCode, purchase: deliveryPurchase }: DeliveryInput) => sendGiftCardEmail({ recipient, rendered: renderGiftCardEmail({ locale: deliveryPurchase.locale as 'en' | 'ar' | 'fr', recipientName: String(deliveryPurchase.recipient_name), buyerName: String(deliveryPurchase.sender_name), message: String(deliveryPurchase.message ?? ''), amountMinor: Number(deliveryPurchase.amount_minor), code: deliveryCode, expiresAt: String(deliveryPurchase.expires_at ?? new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000).toISOString()), recipientCopy: recipient === String(deliveryPurchase.recipient_email).toLowerCase() }) }));

  // Idempotent recovery: a prior attempt may have issued the card but crashed
  // before marking the purchase paid. Recover it instead of inserting a second
  // card (which would violate the unique purchase_id constraint).
  const { data: existingCard } = await client.from('gift_cards').select('id,delivery_status,code_ciphertext,expires_at').eq('purchase_id', purchase.id).maybeSingle();
  if (existingCard) return recoverGiftCardActivation(client, purchase, existingCard, transaction.providerReference, { secret, now, deliver });

  const code = generateGiftCardCode();
  const cardId = randomUUID();
  const { data: card, error: cardError } = await client.from('gift_cards').insert({ id: cardId, purchase_id: purchase.id, code_hash: hashGiftCardCode(code, secret), code_ciphertext: encryptGiftCardCode(code, secret), code_last4: code.replace(/-/g, '').slice(-4), initial_balance_minor: purchase.amount_minor, balance_minor: purchase.amount_minor, recipient_name: purchase.recipient_name, recipient_email: purchase.recipient_email, buyer_email: purchase.sender_email, status: 'active', locale: purchase.locale ?? 'en', expires_at: new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000).toISOString(), delivery_status: 'pending', delivery_attempts: 0, activated_at: now.toISOString() }).select('id').single();
  if (cardError || !card) {
    // A concurrent callback may have inserted the card between our lookup and
    // this insert. If so, recover instead of stranding the purchase.
    const { data: raced } = await client.from('gift_cards').select('id,delivery_status,code_ciphertext,expires_at').eq('purchase_id', purchase.id).maybeSingle();
    if (raced) return recoverGiftCardActivation(client, purchase, raced, transaction.providerReference, { secret, now, deliver });
    return { handled: true, status: 'failed' };
  }
  await client.from('gift_card_transactions').insert({ gift_card_id: String(card.id), type: 'issue', amount_minor: purchase.amount_minor, idempotency_key: `gift-card-issue:${purchase.id}`, metadata: { provider_reference: transaction.providerReference } });
  await client.from('gift_card_purchases').update({ status: 'paid', provider_reference: transaction.providerReference, updated_at: now.toISOString() }).eq('id', purchase.id);

  const claimToken = await claimGiftCardDelivery(client, String(card.id), now);
  if (!claimToken) return { handled: true, status: 'activated' };

  const recipients = [...new Set([String(purchase.sender_email).trim().toLowerCase(), String(purchase.recipient_email).trim().toLowerCase()])].filter(Boolean);
  let failed = 0;
  for (const recipient of recipients) if (!(await deliver({ recipient, code, purchase: { ...purchase, expires_at: new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000).toISOString() } }))) failed += 1;
  const deliveryStatus: DeliveryStatus = failed ? 'failed' : 'sent';
  const deliveryError = failed ? 'smtp_failed' : null;
  const completed = await completeGiftCardDelivery(client, String(card.id), claimToken, deliveryStatus, deliveryError);
  if (completed) {
    const deliveryState = { delivery_status: deliveryStatus, delivery_attempts: 1, last_delivery_error: deliveryError };
    await client.from('gift_card_purchases').update(deliveryState).eq('id', purchase.id);
  }
  return { handled: true, status: 'activated' };
}

export async function quoteGiftCardForOrder(client: GiftCardClient, input: { code: string; orderTotalMinor: number; now?: Date }): Promise<{ ok: true; value: GiftCardQuote & { giftCardId: string } } | { ok: false; error: 'invalid_gift_card' }> {
  try {
    const secret = getRequiredServerEnv('GIFT_CARD_SECRET');
    const { data: card } = await client.from('gift_cards').select('id,balance_minor,code_last4,status,expires_at').eq('code_hash', hashGiftCardCode(input.code, secret)).maybeSingle();
    if (!card || card.status !== 'active' || new Date(card.expires_at).getTime() <= (input.now ?? new Date()).getTime() || card.balance_minor <= 0) return { ok: false, error: 'invalid_gift_card' };
    const { data: holds } = await client.from('gift_card_holds').select('amount_minor,expires_at').eq('gift_card_id', card.id).eq('status', 'held');
    const now = input.now ?? new Date();
    const heldMinor = ((holds ?? []) as Array<{ amount_minor: number; expires_at: string }>).filter((hold) => new Date(hold.expires_at).getTime() > now.getTime()).reduce((sum, hold) => sum + Number(hold.amount_minor), 0);
    const availableMinor = Math.max(0, Number(card.balance_minor) - heldMinor);
    if (availableMinor <= 0) return { ok: false, error: 'invalid_gift_card' };
    const amountAppliedMinor = Math.min(availableMinor, Math.max(0, input.orderTotalMinor));
    return { ok: true, value: { giftCardId: String(card.id), codeLast4: String(card.code_last4), amountAppliedMinor, remainingTotalMinor: Math.max(0, input.orderTotalMinor - amountAppliedMinor) } };
  } catch {
    return { ok: false, error: 'invalid_gift_card' };
  }
}

export async function quoteGiftCard(client: GiftCardClient, input: { code: string; orderTotalMinor: number; now?: Date }): Promise<{ ok: true; value: GiftCardQuote } | { ok: false; error: 'invalid_gift_card' }> {
  const result = await quoteGiftCardForOrder(client, input);
  return result.ok ? { ok: true, value: { codeLast4: result.value.codeLast4, amountAppliedMinor: result.value.amountAppliedMinor, remainingTotalMinor: result.value.remainingTotalMinor } } : result;
}

export async function holdGiftCardForOrder(client: GiftCardClient, input: { code: string; orderId: string; amountMinor: number }): Promise<{ ok: true; holdId: string } | { ok: false; error: 'invalid_gift_card' }> {
  try {
    const secret = getRequiredServerEnv('GIFT_CARD_SECRET');
    const { data, error } = await client.rpc?.('reserve_gift_card', { p_code_hash: hashGiftCardCode(input.code, secret), p_order_id: input.orderId, p_amount_minor: input.amountMinor }) ?? { data: null, error: new Error('RPC unavailable') };
    if (error || !data) return { ok: false, error: 'invalid_gift_card' };
    return { ok: true, holdId: String(data) };
  } catch {
    return { ok: false, error: 'invalid_gift_card' };
  }
}

export async function settleGiftCardOrderPayment(
  client: GiftCardRpcClient,
  order: { id: string; gift_card_hold_id?: string | null },
  input: { success: boolean; providerReference: string },
): Promise<{ ok: true } | { ok: false; error: 'gift_card_settlement_failed' }> {
  if (!order.gift_card_hold_id) return { ok: true };
  if (!client.rpc) return { ok: false, error: 'gift_card_settlement_failed' };
  const name = input.success ? 'redeem_gift_card_hold' : 'release_gift_card_hold';
  const { error } = await client.rpc(name, { p_hold_id: order.gift_card_hold_id, p_idempotency_key: `gift-card-${input.success ? 'redeem' : 'release'}:${input.providerReference}` });
  return error ? { ok: false, error: 'gift_card_settlement_failed' } : { ok: true };
}

export async function restoreGiftCardForCancelledOrder(
  client: GiftCardRpcClient,
  input: { orderId: string; giftCardId?: string | null; amountMinor?: number },
): Promise<'restored' | 'already_restored' | 'not_applicable' | 'failure'> {
  if (!input.giftCardId || !input.amountMinor || input.amountMinor <= 0) return 'not_applicable';
  if (!client.rpc) return 'failure';
  try {
    const { error } = await client.rpc('refund_gift_card_redemption', { p_gift_card_id: input.giftCardId, p_order_id: input.orderId, p_amount_minor: input.amountMinor, p_idempotency_key: `gift-card-refund:${input.orderId}` });
    if (error) return 'failure';
    return 'restored';
  } catch {
    return 'failure';
  }
}

export function giftCardCodeForDelivery(ciphertext: string, secret: string) {
  return decryptGiftCardCode(ciphertext, secret);
}

export { maskGiftCardCode };
