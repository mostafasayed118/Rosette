import { afterEach, describe, expect, it, vi } from 'vitest';
import { issueGiftCard, listGiftCardTransactions, listGiftCards, resendGiftCard, voidGiftCard } from '@/features/gift-cards/admin-actions';

afterEach(() => vi.unstubAllEnvs());

const admin = { userId: 'admin-1', role: 'admin' as const };
const operator = { userId: 'operator-1', role: 'operator' as const };
const customer = { userId: 'customer-1', role: 'customer' as never };
const input = { mode: 'fixed' as const, amountMinor: 100000, senderName: 'Maya', senderEmail: 'maya@example.com', recipientName: 'Nour', recipientEmail: 'nour@example.com', message: 'A little joy', locale: 'en' as const };

type Call = { table: string; op: string; payload?: Record<string, unknown> };

function fakeClient(card: Record<string, unknown> | null = null) {
  const calls: Call[] = [];
  const from = (table: string) => ({
    select: () => {
      const result = { maybeSingle: async () => ({ data: table === 'gift_cards' ? card : null, error: null }), eq: (_column: string, _value: unknown) => result, order: async () => ({ data: card ? [card] : [], error: null }) };
      return result;
    },
    insert: (payload: Record<string, unknown>) => { calls.push({ table, op: 'insert', payload }); return { select: () => ({ single: async () => ({ data: { id: payload.id }, error: null }) }), error: null }; },
    update: (payload: Record<string, unknown>) => ({ eq: () => { calls.push({ table, op: 'update', payload }); return { error: null }; } }),
  });
  return { client: { from }, calls };
}

describe('gift-card admin actions', () => {
  it('forbids a customer from issuing without writes', async () => {
    const { client, calls } = fakeClient();
    expect(await issueGiftCard(client, customer, input)).toEqual({ status: 'forbidden' });
    expect(calls).toEqual([]);
  });

  it('issues a masked card and audits without returning the plaintext code', async () => {
    vi.stubEnv('GIFT_CARD_SECRET', 'test-secret');
    const { client, calls } = fakeClient();
    const result = await issueGiftCard(client, admin, input, { now: new Date('2026-08-20T00:00:00Z') });
    expect(result).toMatchObject({ status: 'issued', card: { balanceMinor: 100000, status: 'active', codeLast4: expect.any(String) } });
    // Exclude the card id: it is a UUID, and randomUUID() can emit a digit run
    // (e.g. "2438-4364") that falsely matches the XXXX-XXXX code pattern.
    const issuedCard = (result as Extract<typeof result, { status: 'issued' }>).card;
    const { id: _cardId, ...cardWithoutId } = issuedCard;
    expect(JSON.stringify(cardWithoutId)).not.toMatch(/[A-Z2-9]{4}-[A-Z2-9]{4}/);
    expect(calls.find((call) => call.table === 'gift_card_transactions')).toBeDefined();
    expect(calls.find((call) => call.table === 'admin_audit_logs')?.payload).toMatchObject({ action: 'issue_gift_card', target_type: 'gift_card' });
  });

  it('lists masked cards and history only for an operator', async () => {
    const card = { id: 'card-1', code_last4: 'ZZZZ', initial_balance_minor: 100000, balance_minor: 75000, status: 'active', recipient_email: 'nour@example.com', buyer_email: 'maya@example.com', expires_at: '2027-08-20T00:00:00Z', purchase_id: null, delivery_status: 'sent', created_at: '2026-08-20T00:00:00Z' };
    const { client } = fakeClient(card);
    const result = await listGiftCards(client, operator, {});
    expect(result).toEqual([expect.objectContaining({ id: 'card-1', codeLast4: 'ZZZZ', balanceMinor: 75000, source: 'admin' })]);
    expect(JSON.stringify(result)).not.toContain('ciphertext');
    const historyClient = { from: () => ({ select: () => ({ eq: async () => ({ data: [{ type: 'issue', amount_minor: 100000, order_id: null, actor_id: 'admin-1', idempotency_key: 'gift-card-admin-issue:card-1', created_at: '2026-08-20T00:00:00Z' }], error: null }) }) }) };
    expect(await listGiftCardTransactions(historyClient, operator, 'card-1')).toEqual([expect.objectContaining({ type: 'issue', idempotencyKey: '…:card-1' })]);
  });

  it('voids an active card with an audit row and does not return code data', async () => {
    const { client, calls } = fakeClient({ id: 'card-1', status: 'active', balance_minor: 75000 });
    expect(await voidGiftCard(client, admin, 'card-1')).toBe('voided');
    expect(calls.find((call) => call.table === 'gift_cards' && call.op === 'update')?.payload).toMatchObject({ status: 'void' });
    expect(calls.find((call) => call.table === 'admin_audit_logs')).toBeDefined();
  });

  it('persists the card locale for localized admin delivery', async () => {
    vi.stubEnv('GIFT_CARD_SECRET', 'test-secret');
    const { client, calls } = fakeClient();
    await issueGiftCard(client, admin, { ...input, locale: 'ar' }, { now: new Date('2026-08-20T00:00:00Z') });
    expect(calls.find((call) => call.table === 'gift_cards' && call.op === 'insert')?.payload).toMatchObject({ locale: 'ar' });
  });

  it('resends by decrypting only inside the delivery dependency', async () => {
    vi.stubEnv('GIFT_CARD_SECRET', 'test-secret');
    const ciphertext = 'v1.invalid.invalid.invalid';
    const { client } = fakeClient({ id: 'card-1', status: 'active', balance_minor: 75000, code_ciphertext: ciphertext, recipient_email: 'nour@example.com', buyer_email: null });
    const result = await resendGiftCard(client, admin, 'card-1', { deliver: async () => { throw new Error('bad ciphertext'); } });
    expect(result).toBe('failed');
  });
});
