import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(join('supabase/migrations', '027_apply_change_to_order_rpc.sql'), 'utf8');

function body(): string {
  const start = sql.indexOf('create or replace function public.apply_change_to_order');
  if (start === -1) return '';
  const end = sql.indexOf('$$;', start);
  return end === -1 ? '' : sql.slice(start, end);
}

describe('027_apply_change_to_order_rpc migration', () => {
  it('declares the function with the expected signature and returns boolean', () => {
    expect(sql).toContain('create or replace function public.apply_change_to_order(');
    const fn = body();
    expect(fn).toMatch(/\bp_order_id uuid\b/);
    expect(fn).toMatch(/\bp_order_updates jsonb\b/);
    expect(fn).toMatch(/\bp_subtotal_minor integer\b/);
    expect(fn).toMatch(/\bp_total_minor integer\b/);
    expect(fn).toMatch(/\bp_items jsonb\b/);
    expect(fn).toMatch(/returns boolean/);
  });

  it('hardens with security definer and a locked search path', () => {
    expect(body()).toContain('security definer');
    expect(body()).toMatch(/set search_path = public\b/);
  });

  it('rejects negative amounts with a named error', () => {
    expect(body()).toContain("raise exception 'INVALID_AMOUNT'");
  });

  it('always updates the orders subtotal and total so the row never has a stale total', () => {
    const fn = body();
    expect(fn).toMatch(/update public\.orders\s+set subtotal_minor = p_subtotal_minor,\s+total_minor = p_total_minor/);
  });

  it('applies the optional address/delivery field updates with coalesce so a partial diff is safe', () => {
    const fn = body();
    expect(fn).toContain("coalesce(p_order_updates->>'delivery_date', delivery_date)");
    expect(fn).toContain("coalesce(p_order_updates->>'delivery_window', delivery_window)");
    expect(fn).toContain("coalesce(p_order_updates->>'recipient_name', recipient_name)");
    expect(fn).toContain("coalesce(p_order_updates->>'recipient_phone', recipient_phone)");
    expect(fn).toContain("coalesce(p_order_updates->>'delivery_address', delivery_address)");
  });

  it('updates order_items in a loop scoped by order_id so the per-item updates are bound to the same order', () => {
    const fn = body();
    expect(fn).toContain('for v_item in select * from jsonb_array_elements(p_items) loop');
    expect(fn).toMatch(/where id = \(v_item->>'id'\)::uuid\s+and order_id = p_order_id/);
  });

  it('returns true on success', () => {
    expect(body()).toMatch(/return true/);
  });
});
