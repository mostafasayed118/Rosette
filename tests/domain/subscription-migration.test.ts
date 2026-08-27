import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(join('supabase/migrations', '033_subscriptions.sql'), 'utf8');

describe('033_subscriptions migration', () => {
  it('creates the four subscription tables', () => {
    for (const table of ['subscription_plans', 'subscriptions', 'subscription_deliveries', 'subscription_events']) {
      expect(sql).toContain(`create table if not exists public.${table} (`);
    }
  });
  it('subscriptions stores frequency and bundle price', () => {
    expect(sql).toMatch(/frequency text not null check \(frequency in \('weekly', 'biweekly', 'monthly'\)\)/);
    expect(sql).toMatch(/bundle_size integer not null/);
    expect(sql).toMatch(/price_minor integer not null/);
  });
  it('subscriptions tracks status, recipient, first date and checkout order', () => {
    expect(sql).toContain(`check (status in ('pending_payment', 'active', 'paused', 'completed', 'cancelled'))`);
    expect(sql).toMatch(/checkout_order_id uuid references public.orders\(id\)/);
  });
  it('subscriptions snapshots product and variant for fulfilment', () => {
    expect(sql).toMatch(/product_id uuid( not null)? references public\.products\(id\)/);
    expect(sql).toMatch(/variant_id uuid( not null)? references public\.product_variants\(id\)/);
  });
  it('subscription_deliveries is position-ordered and guarded', () => {
    expect(sql).toContain(`unique(subscription_id, position)`);
    expect(sql).toContain(`check (status in ('scheduled', 'ordered', 'cancelled'))`);
  });
  it('orders gets subscription linking columns', () => {
    expect(sql).toContain(`alter table public.orders add column if not exists subscription_id uuid references public.subscriptions(id);`);
    expect(sql).toContain(`alter table public.orders add column if not exists subscription_delivery_id uuid references public.subscription_deliveries(id);`);
  });
  it('gift_card_purchases gets a nullable source column', () => {
    expect(sql).toContain(`alter table public.gift_card_purchases add column if not exists source text;`);
  });
  it('does not grant anon or authenticated access to the new tables', () => {
    expect(sql).not.toMatch(/grants? (select|insert).*\b(subscription_plans|subscriptions|subscription_deliveries|subscription_events)\b/);
  });
});
