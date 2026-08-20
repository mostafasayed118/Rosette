import { randomUUID } from 'node:crypto';
import { getRequiredServerEnv } from '@/lib/server-env';
import { createPaymobIntention } from '@/features/payment/paymob-client';
import type { PaymentCustomer } from '@/features/payment/types';
import { decryptGiftCardCode, encryptGiftCardCode, generateGiftCardCode, hashGiftCardCode, maskGiftCardCode } from './crypto';
import type { GiftCardPurchaseInput, GiftCardQuote } from './types';
import { validateGiftCardPurchaseInput } from './validation';

export type GiftCardClient = { from: (table: string) => any; rpc?: (name: string, args: Record<string, unknown>) => any };
type GiftCardIntentionInput = { amountMinor: number; orderReference: string; specialReference: string; customer: PaymentCustomer; notificationUrl: string; redirectionUrl: string };
type GiftCardIntentionCreator = (input: GiftCardIntentionInput) => Promise<{ providerReference: string; checkoutUrl: string }>;
type DeliveryInput = { recipient: string; code: string; purchase: Record<string, unknown> };

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

export async function activateGiftCardPurchase(
  client: GiftCardClient,
  transaction: { specialReference: string; amountMinor: number; providerReference: string; success: boolean },
  deps: { secret?: string; now?: Date; deliver?: (input: DeliveryInput) => Promise<boolean> } = {},
): Promise<{ handled: true; status: 'activated' | 'already_processed' | 'failed' | 'ignored' }> {
  if (!transaction.specialReference.startsWith('giftcard:')) return { handled: true, status: 'ignored' };
  const reference = transaction.specialReference.slice('giftcard:'.length);
  if (!reference) return { handled: true, status: 'ignored' };
  const { data: purchase } = await client.from('gift_card_purchases').select('*').eq('reference', reference).maybeSingle();
  if (!purchase) return { handled: true, status: 'ignored' };
  if (purchase.status === 'paid') return { handled: true, status: 'already_processed' };
  if (!transaction.success || Number(purchase.amount_minor) !== transaction.amountMinor) {
    await client.from('gift_card_purchases').update({ status: 'failed', updated_at: new Date().toISOString() }).eq('id', purchase.id);
    return { handled: true, status: 'failed' };
  }

  const now = deps.now ?? new Date();
  const secret = deps.secret ?? getRequiredServerEnv('GIFT_CARD_SECRET');
  const code = generateGiftCardCode();
  const cardId = randomUUID();
  const { data: card, error: cardError } = await client.from('gift_cards').insert({ id: cardId, purchase_id: purchase.id, code_hash: hashGiftCardCode(code, secret), code_ciphertext: encryptGiftCardCode(code, secret), code_last4: code.replace(/-/g, '').slice(-4), initial_balance_minor: purchase.amount_minor, balance_minor: purchase.amount_minor, recipient_name: purchase.recipient_name, recipient_email: purchase.recipient_email, buyer_email: purchase.sender_email, status: 'active', expires_at: new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000).toISOString(), delivery_status: 'pending', delivery_attempts: 0, activated_at: now.toISOString() }).select('id').single();
  if (cardError || !card) return { handled: true, status: 'failed' };
  await client.from('gift_card_transactions').insert({ gift_card_id: String(card.id), type: 'issue', amount_minor: purchase.amount_minor, idempotency_key: `gift-card-issue:${purchase.id}`, metadata: { provider_reference: transaction.providerReference } });
  await client.from('gift_card_purchases').update({ status: 'paid', provider_reference: transaction.providerReference, updated_at: now.toISOString() }).eq('id', purchase.id);

  if (deps.deliver) {
    const recipients = [...new Set([String(purchase.sender_email).trim().toLowerCase(), String(purchase.recipient_email).trim().toLowerCase()])].filter(Boolean);
    let failed = 0;
    for (const recipient of recipients) {
      if (!(await deps.deliver({ recipient, code, purchase }))) failed += 1;
    }
    await client.from('gift_card_purchases').update({ delivery_status: failed ? 'failed' : 'sent', delivery_attempts: 1, last_delivery_error: failed ? 'smtp_failed' : null }).eq('id', purchase.id);
  }
  return { handled: true, status: 'activated' };
}

export async function quoteGiftCardForOrder(client: GiftCardClient, input: { code: string; orderTotalMinor: number; now?: Date }): Promise<{ ok: true; value: GiftCardQuote & { giftCardId: string } } | { ok: false; error: 'invalid_gift_card' }> {
  try {
    const secret = getRequiredServerEnv('GIFT_CARD_SECRET');
    const { data: card } = await client.from('gift_cards').select('id,balance_minor,code_last4,status,expires_at').eq('code_hash', hashGiftCardCode(input.code, secret)).maybeSingle();
    if (!card || card.status !== 'active' || new Date(card.expires_at).getTime() <= (input.now ?? new Date()).getTime() || card.balance_minor <= 0) return { ok: false, error: 'invalid_gift_card' };
    const amountAppliedMinor = Math.min(Number(card.balance_minor), Math.max(0, input.orderTotalMinor));
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

export function giftCardCodeForDelivery(ciphertext: string, secret: string) {
  return decryptGiftCardCode(ciphertext, secret);
}

export { maskGiftCardCode };
