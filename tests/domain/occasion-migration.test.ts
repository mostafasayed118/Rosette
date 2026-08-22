import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync('supabase/migrations/018_occasion_reminders.sql', 'utf8');

/**
 * Slice a single `create table` block out of the migration so assertions can be
 * scoped to one table. Without this, a `toContain` on a column definition could
 * be satisfied by any table in the file.
 */
function tableBody(name: string): string {
  const start = sql.indexOf(`create table if not exists public.${name} (`);
  if (start === -1) return '';
  const end = sql.indexOf('\n);', start);
  return end === -1 ? '' : sql.slice(start, end);
}

/** Slice one parenthesised branch out of the occasion_shape check constraint. */
function shapeBranch(recurrence: string): string {
  return tableBody('occasions').match(new RegExp(`\\(recurrence = '${recurrence}'[^)]*\\)`))?.[0] ?? '';
}

describe('018_occasion_reminders migration', () => {
  it('creates the three tables', () => {
    expect(sql).toContain('create table if not exists public.recipients');
    expect(sql).toContain('create table if not exists public.occasions');
    expect(sql).toContain('create table if not exists public.occasion_reminders');
  });

  it('enforces the annual shape in the database', () => {
    expect(sql).toContain('constraint occasion_shape');
    const annual = shapeBranch('annual');
    expect(annual).not.toBe('');
    expect(annual).toContain('month is not null');
    expect(annual).toContain('day is not null');
    expect(annual).toContain('event_date is null');
  });

  it('enforces the once shape in the database', () => {
    const once = shapeBranch('once');
    expect(once).not.toBe('');
    expect(once).toContain('event_date is not null');
    expect(once).toContain('month is null');
    expect(once).toContain('day is null');
  });

  it('guarantees one reminder per occasion per cycle', () => {
    expect(sql).toContain('unique (occasion_id, cycle_year)');
  });

  it('constrains suppressed_reason to the known reasons', () => {
    expect(tableBody('occasion_reminders')).toContain(
      "suppressed_reason in ('already_ordered', 'engagement_disabled')",
    );
  });

  it('dedupes recipients per customer', () => {
    expect(tableBody('recipients')).toContain('unique (customer_id, name)');
  });

  it('stops an occasion referencing another customer\u2019s recipient', () => {
    expect(tableBody('recipients')).toContain('unique (customer_id, id)');
    expect(tableBody('occasions')).toMatch(/recipient_id uuid not null/);
    expect(tableBody('occasions')).toContain(
      'foreign key (customer_id, recipient_id) references public.recipients(customer_id, id) on delete cascade',
    );
  });

  it('enables RLS on all three tables', () => {
    expect(sql).toContain('alter table public.recipients enable row level security');
    expect(sql).toContain('alter table public.occasions enable row level security');
    expect(sql).toContain('alter table public.occasion_reminders enable row level security');
  });

  it('grants customers read access only', () => {
    expect(sql).toContain('customer_id = auth.uid()');
    // Exactly one select policy per table, and no write policies. `not.toContain`
    // on a single verb is not enough: `for all` (see 008_promos.sql) would slip past.
    expect((sql.match(/create policy/g) ?? []).length).toBe(3);
    expect(sql).not.toMatch(/for\s+(insert|update|delete|all)\b/);
  });

  it('cascades from profiles on both customer-owned tables', () => {
    expect(tableBody('recipients')).toContain(
      'customer_id uuid not null references public.profiles(id) on delete cascade',
    );
    expect(tableBody('occasions')).toContain(
      'customer_id uuid not null references public.profiles(id) on delete cascade',
    );
  });

  it('indexes both foreign keys on occasions', () => {
    expect(sql).toContain('occasions_customer_idx on public.occasions(customer_id)');
    expect(sql).toContain('occasions_recipient_idx on public.occasions(recipient_id)');
  });
});
