import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(join('supabase/migrations', '035_create_pending_order_groups.sql'), 'utf8');

function body(): string {
  const start = sql.indexOf('create or replace function public.create_pending_order');
  if (start === -1) return '';
  const end = sql.indexOf('$$;', start);
  return end === -1 ? '' : sql.slice(start, end);
}

describe('035_create_pending_order_groups migration', () => {
  it('replaces create_pending_order with a p_groups parameter', () => {
    expect(body()).toContain('create or replace function public.create_pending_order(');
    expect(body()).toContain("p_groups jsonb default '[]'");
  });

  it('inserts one group row per entry when groups are provided', () => {
    const fn = body();
    expect(fn).toMatch(/for v_group in select \* from jsonb_array_elements\(coalesce\(p_groups, '\[\]'::jsonb\)\) loop/);
    const groupInsertStart = fn.indexOf('insert into public.order_delivery_groups(');
    expect(groupInsertStart).toBeGreaterThan(-1);
    expect(fn.slice(groupInsertStart)).toContain("encode(extensions.gen_random_bytes(24), 'hex')");
  });

  it('links order_items to their group via groupIndex', () => {
    expect(body()).toContain("v_line->>'groupIndex'");
    expect(body()).toContain('delivery_group_id');
  });

  it('mirrors group 0 into orders.delivery_* when groups exist', () => {
    const fn = body();
    expect(fn).toMatch(/recipient_name\s*=\s*coalesce\(/);
    expect(fn).toMatch(/delivery_date\s*=\s*coalesce\(/);
  });

  it('leaves behavior intact when p_groups is empty', () => {
    const fn = body();
    expect(fn).toMatch(/v_active_groups\s*:=\s*p_groups is not null and jsonb_typeof\(p_groups\) = 'array' and jsonb_array_length\(p_groups\) > 0/);
  });

  it('rejects more than 10 groups', () => {
    expect(body()).toContain('TOO_MANY_GROUPS');
  });
});
