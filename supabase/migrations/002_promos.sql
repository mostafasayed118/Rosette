create table if not exists public.promo_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  type text not null check (type in ('percent', 'fixed')),
  percent_off integer check (percent_off between 0 and 100),
  value_minor integer check (value_minor >= 0),
  minimum_order_minor integer not null default 0 check (minimum_order_minor >= 0),
  starts_at timestamptz,
  expires_at timestamptz,
  max_uses integer not null default 0 check (max_uses >= 0),
  used_count integer not null default 0 check (used_count >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.orders add column if not exists discount_minor integer not null default 0 check (discount_minor >= 0);
alter table public.orders add column if not exists promo_code text;

create or replace function public.increment_promo_usage(p_code text)
returns void language sql security definer as $$
  update public.promo_codes set used_count = used_count + 1 where code = p_code;
$$;

alter table public.promo_codes enable row level security;
create policy "public can select active promo codes" on public.promo_codes for select using (active = true);
create policy "admins can manage promo codes" on public.promo_codes for all using (
  exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role in ('admin', 'operator'))
);
