import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(join('supabase/migrations', '024_create_pending_order.sql'), 'utf8');

function body(): string {
  const start = sql.indexOf('create or replace function public.create_pending_order');
  if (start === -1) return '';
  const end = sql.indexOf('$$;', start);
  return end === -1 ? '' : sql.slice(start, end);
}

describe('024_create_pending_order migration', () => {
  it('declares the function with the expected signature and returns jsonb', () => {
    expect(sql).toContain('create or replace function public.create_pending_order(');
    const fn = body();
    expect(fn).toMatch(/\bp_lines jsonb\b/);
    expect(fn).toMatch(/\bp_destination jsonb\b/);
    expect(fn).toMatch(/\bp_checkout jsonb\b/);
    expect(fn).toMatch(/\bp_customer_id uuid\b/);
    expect(fn).toMatch(/\bp_subtotal_minor integer\b/);
    expect(fn).toMatch(/\bp_delivery_fee_minor integer\b/);
    expect(fn).toMatch(/\bp_discount_minor integer\b/);
    expect(fn).toMatch(/\bp_total_minor integer\b/);
    expect(fn).toMatch(/\bp_promo_code text\b/);
    expect(fn).toMatch(/\bp_gift_card_minor integer\b/);
    expect(fn).toMatch(/returns jsonb/);
  });

  it('hardens the function with security definer and a locked search path', () => {
    expect(body()).toContain('security definer');
    expect(body()).toMatch(/set search_path = public\b/);
  });

  it('rejects empty carts and negative amounts with named errors', () => {
    const fn = body();
    expect(fn).toContain("raise exception 'EMPTY_CART'");
    expect(fn).toContain("raise exception 'INVALID_AMOUNT'");
  });

  it('performs the order insert with a unique display number and public token', () => {
    const fn = body();
    expect(fn).toMatch(/display_number\s+text/);
    expect(fn).toMatch(/public_token\s+text/);
    expect(fn).toMatch(/extract\(epoch from clock_timestamp\(\)\)/);
    expect(fn).toMatch(/md5\(random\(\)::text\)/);
    expect(fn).toMatch(/extensions\.gen_random_bytes\(24\)/);
    expect(fn).toContain("insert into public.orders(");
  });

  it('inserts one order_items row per cart line', () => {
    const fn = body();
    expect(fn).toContain('for v_line in select * from jsonb_array_elements(p_lines) loop');
    expect(fn).toContain("insert into public.order_items(");
  });

  it('delegates inventory reservation to the existing reserve_order_inventory function', () => {
    const fn = body();
    expect(fn).toContain('perform public.reserve_order_inventory(');
  });

  it('creates a gift-card hold through reserve_gift_card when a card is applied', () => {
    const fn = body();
    expect(fn).toContain('public.reserve_gift_card(');
    expect(fn).toMatch(/gift_card_hold_id = v_hold_id/);
  });

  it('redeems the hold and marks the order paid when the gift card covers the full total', () => {
    const fn = body();
    expect(fn).toMatch(/if p_total_minor = 0 then/);
    expect(fn).toContain('public.redeem_gift_card_hold(');
    expect(fn).toMatch(/payment_status = 'paid'/);
  });

  it('inserts a zero-amount payment row for the gift-card-covers-total case', () => {
    const fn = body();
    expect(fn).toMatch(/insert into public\.payments\([\s\S]*?provider[\s\S]*?idempotency_key/);
    expect(fn).toContain("'gift_card'");
    expect(fn).toMatch(/'gift-card-zero-payment:' \|\| v_order_id::text/);
  });

  it('increments promo usage only when a non-empty code is passed', () => {
    const fn = body();
    expect(fn).toContain('public.increment_promo_usage(');
    expect(fn).toMatch(/if p_promo_code is not null and p_promo_code <> '' then/);
  });

  it('returns the order row plus gift_card_hold_id and zero_total_redeemed', () => {
    const fn = body();
    expect(fn).toMatch(/return jsonb_build_object\(/);
    expect(fn).toMatch(/'order',\s*\(select row_to_json\(o\) from public\.orders o where id = v_order_id\)/);
    expect(fn).toContain("'gift_card_hold_id', v_hold_id");
    expect(fn).toContain("'zero_total_redeemed', v_zero_total_redeemed");
  });

  it('does not call any notification or email function from inside the transaction', () => {
    const fn = body();
    expect(fn).not.toMatch(/deliver_order_notification|send_order_email|notification/);
  });
});
