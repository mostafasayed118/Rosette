-- 033_subscriptions.sql
-- Prepaid flower subscriptions. Security matches 028_hardened_privileges.sql: the new
-- tables ship with NO grants and NO RLS (service_role bypasses RLS); the app touches
-- them only through the service_role client. Every function carries an explicit
-- service_role grant.

create table if not exists public.subscription_plans (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name_en text not null,
  name_ar text not null default '',
  name_fr text not null default '',
  description_en text not null default '',
  description_ar text not null default '',
  description_fr text not null default '',
  product_id uuid references public.products(id),
  frequencies text[] not null check (cardinality(frequencies) > 0),
  bundle_prices jsonb not null,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles(id),
  plan_id uuid not null references public.subscription_plans(id),
  product_id uuid not null references public.products(id),
  variant_id uuid not null references public.product_variants(id),
  status text not null default 'pending_payment' check (status in ('pending_payment', 'active', 'paused', 'completed', 'cancelled')),
  frequency text not null check (frequency in ('weekly', 'biweekly', 'monthly')),
  bundle_size integer not null check (bundle_size > 0),
  price_minor integer not null check (price_minor > 0),
  locale text not null check (locale in ('en', 'ar', 'fr')),
  recipient_name text not null,
  recipient_phone text not null,
  delivery_address text not null,
  delivery_city_code text not null references public.cities(code),
  delivery_window text not null,
  gift_message text not null default '',
  first_delivery_date date not null,
  checkout_order_id uuid references public.orders(id),
  renewal_nudge_sent_at timestamptz,
  renewal_promo_code text,
  cancelled_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.subscription_deliveries (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.subscriptions(id) on delete cascade,
  position integer not null check (position > 0),
  scheduled_date date not null,
  status text not null default 'scheduled' check (status in ('scheduled', 'ordered', 'cancelled')),
  order_id uuid references public.orders(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(subscription_id, position)
);

create table if not exists public.subscription_events (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.subscriptions(id) on delete cascade,
  delivery_id uuid references public.subscription_deliveries(id),
  actor text not null check (actor in ('customer', 'admin', 'system')),
  actor_id uuid references public.profiles(id),
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.orders add column if not exists subscription_id uuid references public.subscriptions(id);
alter table public.orders add column if not exists subscription_delivery_id uuid references public.subscription_deliveries(id);
alter table public.gift_card_purchases add column if not exists source text;
