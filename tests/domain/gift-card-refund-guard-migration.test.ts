import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync('supabase/migrations/021_gift_card_refund_guard.sql', 'utf8');

function body(): string {
  const start = sql.indexOf('create or replace function public.refund_gift_card_redemption');
  if (start === -1) return '';
  const end = sql.indexOf('$$;', start);
  return end === -1 ? '' : sql.slice(start, end);
}

describe('021_gift_card_refund_guard migration', () => {
  it('replaces the same function name and signature as 016_gift_cards', () => {
    expect(sql).toContain('create or replace function public.refund_gift_card_redemption(');
    expect(body()).toMatch(/\bp_gift_card_id uuid\b/);
    expect(body()).toMatch(/\bp_order_id uuid\b/);
    expect(body()).toMatch(/\bp_amount_minor integer\b/);
    expect(body()).toMatch(/\bp_idempotency_key text\b/);
    expect(body()).toMatch(/returns boolean/);
  });

  it('guards against minting store credit when no matching redeem exists', () => {
    const fn = body();
    const notExists = fn.match(/if not exists \(\s*select 1 from public\.gift_card_transactions[\s\S]*?type = 'redeem'[\s\S]*?\) then[\s\S]*?return true;/);
    expect(notExists, 'expected a "no matching redeem → return true" guard').not.toBeNull();
  });

  it('preserves the existing invariants for the happy path', () => {
    const fn = body();
    expect(fn).toContain("if p_amount_minor <= 0 then raise exception 'INVALID_GIFT_CARD_AMOUNT'");
    expect(fn).toContain("if exists (select 1 from public.gift_card_transactions where idempotency_key = p_idempotency_key) then return true;");
    expect(fn).toContain("for update");
    expect(fn).toContain("card.status = 'void'");
    expect(fn).toMatch(/balance_minor \+ p_amount_minor > card\.initial_balance_minor/);
    expect(fn).toMatch(/insert into public\.gift_card_transactions[\s\S]*'refund'[\s\S]*p_idempotency_key/);
  });

  it('hardens the function with security definer and a locked search path', () => {
    expect(body()).toContain('security definer');
    expect(body()).toMatch(/set search_path = public\b/);
  });
});
