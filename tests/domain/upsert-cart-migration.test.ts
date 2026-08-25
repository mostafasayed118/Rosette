import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(join('supabase/migrations', '026_upsert_cart_rpc.sql'), 'utf8');

function body(): string {
  const start = sql.indexOf('create or replace function public.upsert_cart');
  if (start === -1) return '';
  const end = sql.indexOf('$$;', start);
  return end === -1 ? '' : sql.slice(start, end);
}

describe('026_upsert_cart_rpc migration', () => {
  it('declares the function with the expected signature and returns jsonb', () => {
    expect(sql).toContain('create or replace function public.upsert_cart(');
    const fn = body();
    expect(fn).toMatch(/\bp_email text\b/);
    expect(fn).toMatch(/\bp_customer_id uuid\b/);
    expect(fn).toMatch(/\bp_locale text\b/);
    expect(fn).toMatch(/\bp_city text\b/);
    expect(fn).toMatch(/\bp_lines jsonb\b/);
    expect(fn).toMatch(/\bp_restore_token text\b/);
    expect(fn).toMatch(/returns jsonb/);
  });

  it('hardens with security definer and a locked search path', () => {
    expect(body()).toContain('security definer');
    expect(body()).toMatch(/set search_path = public\b/);
  });

  it('deletes the matching active row when the new lines array is empty', () => {
    const fn = body();
    expect(fn).toMatch(/if p_lines is null or jsonb_typeof\(p_lines\) <> 'array' or jsonb_array_length\(p_lines\) = 0 then/);
    expect(fn).toContain('delete from public.carts');
    expect(fn).toMatch(/return jsonb_build_object\('status', 'ok', 'restore_token', ''\)/);
  });

  it('scopes the existing-cart lookup by customer_id for signed-in customers', () => {
    const fn = body();
    expect(fn).toMatch(/if p_customer_id is not null then/);
    expect(fn).toMatch(/customer_id = p_customer_id/);
  });

  it('scopes the existing-cart lookup by customer_id is null for guests', () => {
    const fn = body();
    expect(fn).toMatch(/else/);
    expect(fn).toMatch(/customer_id is null/);
  });

  it('inserts a new row when no matching active row exists', () => {
    const fn = body();
    expect(fn).toContain('insert into public.carts(email, customer_id, locale, city, lines, restore_token, updated_at)');
  });

  it('updates the existing row when one is found, refreshing locale, city, lines, and token', () => {
    const fn = body();
    expect(fn).toMatch(/if v_existing_id is not null then/);
    expect(fn).toMatch(/update public\.carts/);
  });

  it('returns the same restore token for both insert and update paths', () => {
    const fn = body();
    expect(fn).toMatch(/return jsonb_build_object\('status', 'ok', 'restore_token', p_restore_token\)/);
  });
});
