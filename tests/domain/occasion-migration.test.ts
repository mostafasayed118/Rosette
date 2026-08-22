import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync('supabase/migrations/018_occasion_reminders.sql', 'utf8');

describe('018_occasion_reminders migration', () => {
  it('creates the three tables', () => {
    expect(sql).toContain('create table if not exists public.recipients');
    expect(sql).toContain('create table if not exists public.occasions');
    expect(sql).toContain('create table if not exists public.occasion_reminders');
  });

  it('enforces the annual/once shape in the database', () => {
    expect(sql).toContain('constraint occasion_shape');
    expect(sql).toMatch(/recurrence = 'annual'[\s\S]*month is not null/);
    expect(sql).toMatch(/recurrence = 'once'[\s\S]*event_date is not null/);
  });

  it('guarantees one reminder per occasion per cycle', () => {
    expect(sql).toContain('unique (occasion_id, cycle_year)');
  });

  it('dedupes recipients per customer', () => {
    expect(sql).toContain('unique (customer_id, name)');
  });

  it('enables RLS with customer-read policies only', () => {
    expect(sql).toContain('alter table public.recipients enable row level security');
    expect(sql).toContain('alter table public.occasions enable row level security');
    expect(sql).toContain('customer_id = auth.uid()');
    expect(sql).not.toContain('for insert');
  });

  it('cascades from profiles so account deletion cleans up', () => {
    expect(sql).toContain('references public.profiles(id) on delete cascade');
  });
});
