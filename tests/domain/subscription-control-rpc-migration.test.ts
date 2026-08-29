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
describe('033 control RPCs', () => {
  it('declares the control functions security definer + service_role grants', () => {
    for (const name of ['pause_subscription', 'resume_subscription', 'reDateSubsequentDeliveries', 'cancel_subscription']) {
      expect(sql).toContain(`create or replace function public.${name}(`);
      expect(fn(name)).toContain('security definer');
    }
    expect(sql).toContain('grant execute on function public.pause_subscription(uuid) to service_role;');
    expect(sql).toContain('grant execute on function public.resume_subscription(uuid, jsonb) to service_role;');
    expect(sql).toContain('grant execute on function public.reDateSubsequentDeliveries(uuid, integer, jsonb) to service_role;');
    expect(sql).toContain('grant execute on function public.cancel_subscription(uuid) to service_role;');
  });
  it('reDate uses pre-computed dates, never interval math', () => {
    const b = fn('reDateSubsequentDeliveries');
    expect(b).toContain('p_dates jsonb');
    expect(b).not.toMatch(/interval/i);
  });
  it('cancel marks scheduled deliveries cancelled and returns a count', () => {
    const b = fn('cancel_subscription');
    expect(b).toMatch(/status = 'cancelled'/);
    expect(b).toContain('unmaterialized_count');
    expect(b).toMatch(/returns jsonb/);
  });
});
