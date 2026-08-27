import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(join('supabase/migrations', '033_multi_recipient_orders.sql'), 'utf8');

describe('033_multi_recipient_orders migration', () => {
  it('creates order_delivery_groups with the delivery + fulfillment columns', () => {
    expect(sql).toContain('create table public.order_delivery_groups');
    expect(sql).toMatch(/recipient_name text not null/);
    expect(sql).toMatch(/recipient_phone text not null/);
    expect(sql).toMatch(/delivery_address text not null/);
    expect(sql).toMatch(/delivery_date date not null/);
    expect(sql).toMatch(/delivery_window text not null/);
    expect(sql).toMatch(/delivery_fee_minor integer not null default 0/);
    expect(sql).toMatch(/fulfillment_status text not null default 'confirmed'/);
    expect(sql).toMatch(/public_token text not null unique/);
    expect(sql).toMatch(/cancelled_at/);
  });

  it('constrains fulfillment_status to the known domain', () => {
    expect(sql).toContain("'confirmed','preparing','ready_for_delivery'");
    expect(sql).toContain("'out_for_delivery','delivered','cancelled'");
  });

  it('links groups to orders with cascade delete', () => {
    expect(sql).toMatch(/order_id uuid not null references public\.orders\(id\) on delete cascade/);
  });

  it('links order_items to groups and cancel requests to groups', () => {
    expect(sql).toMatch(/order_items\s+add column delivery_group_id uuid references public\.order_delivery_groups\(id\)/);
    expect(sql).toMatch(/order_cancel_requests\s+add column delivery_group_id uuid null/);
  });

  it('grants reads to the owning customer and keeps writes on the service role', () => {
    expect(sql).toMatch(/alter table public\.order_delivery_groups enable row level security/);
    expect(sql).toContain('create policy "customers read own delivery groups"');
    expect(sql).toMatch(/exists \(/);
    expect(sql).toMatch(/from public\.orders o/);
    expect(sql).toMatch(/o\.customer_id = auth\.uid\(\)/);
  });
});