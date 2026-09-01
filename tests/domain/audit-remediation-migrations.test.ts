import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration038 = readFileSync('supabase/migrations/038_audit_remediation.sql', 'utf8');
const migration039 = readFileSync('supabase/migrations/039_dashboard_rpc.sql', 'utf8');
const migration040 = readFileSync('supabase/migrations/040_subscription_security_indexes.sql', 'utf8');

describe('audit remediation migrations', () => {
  it('closes the reservation, subscription materialization, index, and promo races', () => {
    expect(migration038).toContain('create index if not exists inventory_reservations_expires_idx');
    expect(migration038).toContain('release_expired_reservations');
    expect(migration038).toContain('for update of r skip locked');
    expect(migration038).toContain('get diagnostics v_updated = row_count');
    expect(migration038).toContain('on conflict (email) where converted_at is null');
    expect(migration038).toContain("used_count < max_uses");
    expect(migration038).toContain("revoke select, insert, update, delete on public.promo_codes from anon, authenticated");
  });

  it('hardens subscription tables and indexes their cron paths', () => {
    for (const table of ['subscription_plans', 'subscriptions', 'subscription_deliveries', 'subscription_events']) {
      expect(migration040).toMatch(new RegExp(`alter table public\\.${table}\\s+enable row level security`));
    }
    expect(migration040).toContain('subscription_deliveries_due_idx');
    expect(migration040).toContain('subscription_events_subscription_idx');
    expect(migration040).toContain('deny client subscription rows');
  });

  it('keeps dashboard stats in one service-role aggregate', () => {
    expect(migration039).toContain('get_admin_dashboard_stats');
    expect(migration039).toContain('limit 10');
    expect(migration039).toContain('grant execute on function public.get_admin_dashboard_stats(timestamptz)');
  });
});
