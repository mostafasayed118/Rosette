import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
const sql = readFileSync(join('supabase/migrations', '033_subscriptions.sql'), 'utf8');
function fn(name: string): string {
  const s = sql.indexOf(`create or replace function public.${name}`);
  if (s === -1) return '';
  const e = sql.indexOf('$$;', s);
  return e === -1 ? '' : sql.slice(s, e);
}
describe('033 materialize RPC', () => {
  it('declares materialize_subscription_delivery security definer', () => {
    expect(sql).toContain('create or replace function public.materialize_subscription_delivery(');
    const b = fn('materialize_subscription_delivery');
    expect(b).toContain('security definer');
    expect(b).toMatch(/p_subscription_id uuid/);
    expect(b).toMatch(/p_delivery_id uuid/);
    expect(b).toMatch(/returns jsonb/);
  });
  it('guards on scheduled status for idempotency', () => {
    const b = fn('materialize_subscription_delivery');
    expect(b).toMatch(/status = 'scheduled'/);
    expect(b).toContain("'already_ordered'");
  });
  it('creates a zero-total, paid, confirmed order and reserves inventory', () => {
    const b = fn('materialize_subscription_delivery');
    expect(b).toMatch(/payment_status, fulfillment_status/);
    expect(b).toMatch(/'paid', 'confirmed'/);
    expect(b).toMatch(/delivery_fee_minor/);
    expect(b).toContain('public.reserve_order_inventory(');
  });
  it('grants service_role', () => {
    expect(sql).toContain('grant execute on function public.materialize_subscription_delivery(uuid, uuid) to service_role;');
  });
});
