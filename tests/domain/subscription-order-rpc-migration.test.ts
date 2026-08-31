import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(join('supabase/migrations', '037_subscriptions.sql'), 'utf8');
function fn(name: string): string {
  const s = sql.indexOf(`create or replace function public.${name}`);
  if (s === -1) return '';
  const e = sql.indexOf('$$;', s);
  return e === -1 ? '' : sql.slice(s, e);
}

describe('033 subscription order RPCs', () => {
  it('declares create_subscription_order with security definer and locked search path', () => {
    expect(sql).toContain('create or replace function public.create_subscription_order(');
    const b = fn('create_subscription_order');
    expect(b).toMatch(/\bp_checkout jsonb\b/);
    expect(b).toMatch(/\bp_lines jsonb\b/);
    expect(b).toMatch(/returns jsonb/);
    expect(b).toContain('security definer');
    expect(b).toMatch(/set search_path = public\b/);
  });
  it('rejects empty lines and invalid amounts', () => {
    const b = fn('create_subscription_order');
    expect(b).toContain("raise exception 'EMPTY_CART'");
    expect(b).toContain("raise exception 'INVALID_AMOUNT'");
  });
  it('inserts the subscription row without reserving inventory', () => {
    const b = fn('create_subscription_order');
    expect(b).toContain('insert into public.subscriptions(');
    expect(b).not.toMatch(/reserve_order_inventory/);
  });
  it('reuses the paid gift-card path and promo increment', () => {
    const b = fn('create_subscription_order');
    expect(b).toMatch(/payment_status = 'paid'/);
    expect(b).toContain('public.increment_promo_usage(');
  });
  it('activate_subscription takes pre-computed dates and never does interval math', () => {
    expect(sql).toContain('create or replace function public.activate_subscription(');
    const b = fn('activate_subscription');
    expect(b).toMatch(/\bp_dates jsonb\b/);
    expect(b).not.toMatch(/interval/i);
    expect(b).toContain('security definer');
  });
  it('grants service_role execute on both functions', () => {
    expect(sql).toContain('grant execute on function public.create_subscription_order(jsonb, jsonb) to service_role;');
    expect(sql).toContain('grant execute on function public.activate_subscription(uuid, jsonb) to service_role;');
  });
});
