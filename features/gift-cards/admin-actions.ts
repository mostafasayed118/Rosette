import { randomUUID } from 'node:crypto';
import { getRequiredServerEnv } from '@/lib/server-env';
import type { AdminIdentity } from '@/features/admin/authorization';
import { decryptGiftCardCode, encryptGiftCardCode, generateGiftCardCode, hashGiftCardCode } from './crypto';
import type { GiftCardMaskedRow, GiftCardPurchaseInput } from './types';
import { validateGiftCardPurchaseInput } from './validation';

type AdminGiftCardClient = { from: (table: string) => any };
type AdminDelivery = (input: { recipient: string; code: string; card: Record<string, unknown> }) => Promise<boolean>;

function canOperate(identity: AdminIdentity) {
  return identity.role === 'admin' || identity.role === 'operator';
}

function maskedRow(row: Record<string, any>): GiftCardMaskedRow {
  return { id: String(row.id), codeLast4: String(row.code_last4), initialBalanceMinor: Number(row.initial_balance_minor), balanceMinor: Number(row.balance_minor), status: row.status, recipientEmail: row.recipient_email ?? null, buyerEmail: row.buyer_email ?? null, expiresAt: String(row.expires_at), source: row.purchase_id ? 'purchase' : 'admin', deliveryStatus: row.delivery_status, createdAt: String(row.created_at) };
}

export type AdminIssueResult = { status: 'issued'; card: GiftCardMaskedRow } | { status: 'forbidden' | 'validation' | 'failure' };

export async function issueGiftCard(client: AdminGiftCardClient, identity: AdminIdentity, input: GiftCardPurchaseInput, deps: { now?: Date; deliver?: AdminDelivery } = {}): Promise<AdminIssueResult> {
  if (!canOperate(identity)) return { status: 'forbidden' };
  const validation = validateGiftCardPurchaseInput(input);
  if (!validation.ok) return { status: 'validation' };
  try {
    const value = validation.value;
    const secret = getRequiredServerEnv('GIFT_CARD_SECRET');
    const now = deps.now ?? new Date();
    const code = generateGiftCardCode();
    const cardId = randomUUID();
    const row = { id: cardId, purchase_id: null, code_hash: hashGiftCardCode(code, secret), code_ciphertext: encryptGiftCardCode(code, secret), code_last4: code.replace(/-/g, '').slice(-4), initial_balance_minor: value.amountMinor, balance_minor: value.amountMinor, recipient_name: value.recipientName, recipient_email: value.recipientEmail, buyer_email: value.senderEmail, status: 'active', locale: value.locale, expires_at: new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000).toISOString(), issued_by: identity.userId, delivery_status: 'pending', delivery_attempts: 0, activated_at: now.toISOString(), created_at: now.toISOString() };
    const { error } = await client.from('gift_cards').insert(row);
    if (error) return { status: 'failure' };
    await client.from('gift_card_transactions').insert({ gift_card_id: cardId, type: 'issue', amount_minor: value.amountMinor, actor_id: identity.userId, idempotency_key: `gift-card-admin-issue:${cardId}`, metadata: { source: 'admin' } });
    await client.from('admin_audit_logs').insert({ actor_id: identity.userId, action: 'issue_gift_card', target_type: 'gift_card', target_id: cardId, metadata: { amount_minor: value.amountMinor, code_last4: row.code_last4 } });
    if (deps.deliver) {
      const recipients = [...new Set([value.senderEmail, value.recipientEmail].map((email) => email.trim().toLowerCase()))];
      let failed = 0;
      for (const recipient of recipients) if (!(await deps.deliver({ recipient, code, card: row }))) failed += 1;
      await client.from('gift_cards').update({ delivery_status: failed ? 'failed' : 'sent', delivery_attempts: 1, last_delivery_error: failed ? 'smtp_failed' : null }).eq('id', cardId);
      row.delivery_status = failed ? 'failed' : 'sent';
    }
    return { status: 'issued', card: maskedRow(row) };
  } catch {
    return { status: 'failure' };
  }
}

export async function listGiftCards(client: AdminGiftCardClient, identity: AdminIdentity, filters: { status?: string; search?: string }): Promise<GiftCardMaskedRow[]> {
  if (!canOperate(identity)) return [];
  const { data } = await client.from('gift_cards').select('id,code_last4,initial_balance_minor,balance_minor,status,recipient_email,buyer_email,expires_at,purchase_id,delivery_status,created_at').order('created_at', { ascending: false });
  return ((data ?? []) as Record<string, any>[]).filter((row) => (!filters.status || row.status === filters.status) && (!filters.search || `${row.code_last4} ${row.recipient_email ?? ''} ${row.buyer_email ?? ''}`.toLowerCase().includes(filters.search.toLowerCase()))).map(maskedRow);
}

export async function listGiftCardTransactions(client: AdminGiftCardClient, identity: AdminIdentity, cardId: string) {
  if (!canOperate(identity)) return [];
  const { data } = await client.from('gift_card_transactions').select('type,amount_minor,order_id,actor_id,idempotency_key,created_at').eq('gift_card_id', cardId);
  return ((data ?? []) as Record<string, any>[]).map((row) => ({ type: row.type, amountMinor: Number(row.amount_minor), orderId: row.order_id ?? null, actorId: row.actor_id ?? null, idempotencyKey: `…:${String(row.idempotency_key).split(':').pop() ?? ''}`, createdAt: String(row.created_at) }));
}

export async function voidGiftCard(client: AdminGiftCardClient, identity: AdminIdentity, cardId: string): Promise<'voided' | 'already_void' | 'not_found' | 'held' | 'failure' | 'forbidden'> {
  if (!canOperate(identity)) return 'forbidden';
  try {
    const { data: card } = await client.from('gift_cards').select('id,status,balance_minor').eq('id', cardId).maybeSingle();
    if (!card) return 'not_found';
    if (card.status === 'void') return 'already_void';
    const { data: hold } = await client.from('gift_card_holds').select('id').eq('gift_card_id', cardId).eq('status', 'held').maybeSingle();
    if (hold) return 'held';
    if (Number(card.balance_minor) <= 0) return 'already_void';
    const { error } = await client.from('gift_cards').update({ status: 'void', updated_at: new Date().toISOString() }).eq('id', cardId);
    if (error) return 'failure';
    await client.from('gift_card_transactions').insert({ gift_card_id: cardId, type: 'void', amount_minor: Number(card.balance_minor), actor_id: identity.userId, idempotency_key: `gift-card-void:${cardId}`, metadata: {} });
    await client.from('admin_audit_logs').insert({ actor_id: identity.userId, action: 'void_gift_card', target_type: 'gift_card', target_id: cardId, metadata: { amount_minor: Number(card.balance_minor) } });
    return 'voided';
  } catch {
    return 'failure';
  }
}

export async function resendGiftCard(client: AdminGiftCardClient, identity: AdminIdentity, cardId: string, deps: { deliver: AdminDelivery }): Promise<'sent' | 'failed' | 'not_found' | 'forbidden'> {
  if (!canOperate(identity)) return 'forbidden';
  try {
    const { data: card } = await client.from('gift_cards').select('*').eq('id', cardId).maybeSingle();
    if (!card) return 'not_found';
    const code = decryptGiftCardCode(String(card.code_ciphertext), getRequiredServerEnv('GIFT_CARD_SECRET'));
    const recipients = [...new Set([card.buyer_email, card.recipient_email].filter((email): email is string => typeof email === 'string' && email.length > 0).map((email) => email.toLowerCase()))];
    let failed = 0;
    for (const recipient of recipients) if (!(await deps.deliver({ recipient, code, card }))) failed += 1;
    const status = failed ? 'failed' : 'sent';
    await client.from('gift_cards').update({ delivery_status: status, delivery_attempts: Number(card.delivery_attempts ?? 0) + 1, last_delivery_error: failed ? 'smtp_failed' : null }).eq('id', cardId);
    await client.from('admin_audit_logs').insert({ actor_id: identity.userId, action: 'resend_gift_card', target_type: 'gift_card', target_id: cardId, metadata: { delivery_status: status } });
    return status;
  } catch {
    return 'failed';
  }
}
