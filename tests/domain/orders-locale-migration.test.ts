import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(join('supabase/migrations', '032_orders_locale_fr.sql'), 'utf8');

describe('032_orders_locale_fr migration', () => {
  it('replaces the orders.locale check with an idempotent drop/add', () => {
    expect(sql).toContain('alter table public.orders drop constraint if exists orders_locale_check;');
    expect(sql).toContain('alter table public.orders add constraint orders_locale_check');
  });

  it('allows en, ar, and fr — French checkout previously violated the old CHECK', () => {
    expect(sql).toMatch(/check\s*\(\s*locale\s*=\s*any\s*\(array\['en'::text,\s*'ar'::text,\s*'fr'::text\]\)\s*\)/);
    expect(sql).not.toMatch(/'fr'::text,\s*'fr'/);
  });

  it('does not narrow the original two supported locales away', () => {
    expect(sql).toMatch(/'en'::text/);
    expect(sql).toMatch(/'ar'::text/);
  });
});
