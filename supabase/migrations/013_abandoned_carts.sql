-- Abandoned-cart recovery. One active (unconverted) cart per email; the
-- partial unique index frees the email once an order converts the cart.
-- No RLS policies: every read/write goes through the service-role client.
create table if not exists public.carts (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  customer_id uuid references public.profiles(id) on delete cascade,
  locale text not null default 'en' check (locale in ('en', 'ar', 'fr')),
  city text not null default 'cairo',
  lines jsonb not null,
  restore_token text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_emailed_at timestamptz,
  converted_at timestamptz
);

create unique index if not exists carts_email_active_idx
  on public.carts (email) where converted_at is null;
create unique index if not exists carts_restore_token_idx
  on public.carts (restore_token);
create index if not exists carts_abandoned_idx
  on public.carts (updated_at) where converted_at is null and last_emailed_at is null;

alter table public.carts enable row level security;
