-- Occasion reminders. Recipient details currently live inline on orders
-- (001_commerce.sql:78), so there is no reusable contact to remind about.
-- These tables introduce one, plus saved dates and an idempotency ledger.
-- Reads are customer-scoped via RLS; every write goes through service-role
-- code paths, matching the wishlist convention in 012_wishlist.sql.

create table if not exists public.recipients (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  phone text,
  city_slug text,
  relationship text,
  created_at timestamptz not null default now(),
  unique (customer_id, name)
);

create index if not exists recipients_customer_idx on public.recipients(customer_id);

create table if not exists public.occasions (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.recipients(id) on delete cascade,
  kind text not null check (kind in ('birthday', 'anniversary', 'graduation', 'other')),
  recurrence text not null check (recurrence in ('annual', 'once')),
  -- annual: month + day set, event_date null. once: event_date set only.
  -- day is bounded 1-31 rather than validated per month; impossible pairs
  -- (Feb 30) are clamped when the cron resolves a concrete date, so a saved
  -- date is never silently dropped.
  month smallint check (month between 1 and 12),
  day smallint check (day between 1 and 31),
  event_date date,
  lead_days smallint not null default 7 check (lead_days between 1 and 30),
  locale text not null default 'en' check (locale in ('en', 'ar', 'fr')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint occasion_shape check (
    (recurrence = 'annual' and month is not null and day is not null and event_date is null)
    or (recurrence = 'once' and event_date is not null and month is null and day is null)
  )
);

create index if not exists occasions_customer_idx on public.occasions(customer_id);
create index if not exists occasions_active_idx on public.occasions(active) where active;

-- One row per occasion per cycle. The cron inserts this BEFORE sending, so the
-- unique constraint is what makes overlapping runs safe.
create table if not exists public.occasion_reminders (
  id uuid primary key default gen_random_uuid(),
  occasion_id uuid not null references public.occasions(id) on delete cascade,
  cycle_year smallint not null,
  sent_at timestamptz,
  suppressed_reason text check (suppressed_reason in ('already_ordered', 'engagement_disabled')),
  converted_order_id uuid references public.orders(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (occasion_id, cycle_year)
);

create index if not exists occasion_reminders_occasion_idx on public.occasion_reminders(occasion_id);

alter table public.recipients enable row level security;
alter table public.occasions enable row level security;
alter table public.occasion_reminders enable row level security;

create policy "customers read own recipients" on public.recipients
  for select using (customer_id = auth.uid());

create policy "customers read own occasions" on public.occasions
  for select using (customer_id = auth.uid());

create policy "customers read own occasion reminders" on public.occasion_reminders
  for select using (
    exists (
      select 1 from public.occasions o
      where o.id = occasion_reminders.occasion_id and o.customer_id = auth.uid()
    )
  );
