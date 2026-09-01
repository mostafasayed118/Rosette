import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync('supabase/migrations/039_dashboard_rpc.sql', 'utf8');

describe('dashboard aggregate RPC migration', () => {
  it('uses one service-role aggregate instead of client-side unbounded reads', () => {
    expect(sql).toContain('create or replace function public.get_admin_dashboard_stats');
    expect(sql).toContain("grant execute on function public.get_admin_dashboard_stats(timestamptz)");
    expect(sql).toContain("to service_role");
    expect(sql).toContain("where payment_status = 'paid'");
    expect(sql).toContain("'awaitingFulfillment'");
    expect(sql).toContain("'revenueTodayMinor'");
    expect(sql).toContain("'revenueAllTimeMinor'");
    expect(sql).toContain("'lowStock'");
    expect(sql).toContain("limit 10");
  });

  it('keeps the function inaccessible to browser roles', () => {
    expect(sql).toContain('revoke all on function public.get_admin_dashboard_stats(timestamptz)');
    expect(sql).toContain('from public, anon, authenticated');
  });
});
