import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(join('supabase/migrations', '025_paymob_webhook_idempotency.sql'), 'utf8');

describe('025_paymob_webhook_idempotency migration', () => {
  it('creates the webhook_quarantine table with a uuid pk, provider, payload, and error_message', () => {
    expect(sql).toContain('create table if not exists public.webhook_quarantine');
    expect(sql).toMatch(/\bid uuid primary key default gen_random_uuid\(\)/);
    expect(sql).toMatch(/\bprovider text not null\b/);
    expect(sql).toMatch(/\bpayload jsonb not null\b/);
    expect(sql).toMatch(/\berror_message text not null\b/);
    expect(sql).toMatch(/\breceived_at timestamptz not null default now\(\)/);
    expect(sql).toMatch(/\bresolved_at timestamptz/);
  });

  it('indexes unresolved rows by received_at and by provider-reference', () => {
    expect(sql).toContain('webhook_quarantine_received_idx');
    expect(sql).toContain('webhook_quarantine_reference_idx');
    expect(sql).toMatch(/where resolved_at is null/);
  });

  it('enables RLS with an explicit deny-all policy for non-service-role clients', () => {
    expect(sql).toContain('alter table public.webhook_quarantine enable row level security');
    expect(sql).toContain('create policy "deny all" on public.webhook_quarantine');
  });

  it('adds a payments.provider_reference index to make idempotency lookups O(log n)', () => {
    expect(sql).toContain('create index if not exists payments_reference_idx');
    expect(sql).toMatch(/on public\.payments\(provider_reference\) where provider_reference is not null/);
  });
});
