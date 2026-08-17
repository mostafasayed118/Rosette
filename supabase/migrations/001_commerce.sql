create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  phone text,
  role text not null default 'customer' check (role in ('customer', 'operator', 'admin')),
  created_at timestamptz not null default now()
);

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name_en text not null,
  name_ar text not null,
  active boolean not null default true
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name_en text not null,
  name_ar text not null,
  description_en text not null default '',
  description_ar text not null default '',
  category text not null,
  occasions text[] not null default '{}',
  price_minor integer not null check (price_minor >= 0),
  tone text not null default 'mixed',
  delivery text not null default 'next-day',
  add_ons jsonb not null default '[]'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  name_en text not null,
  name_ar text not null default '',
  price_delta_minor integer not null default 0,
  active boolean not null default true
);

create table if not exists public.cities (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name_en text not null,
  name_ar text not null,
  same_day boolean not null default false,
  active boolean not null default true
);

create table if not exists public.delivery_rules (
  id uuid primary key default gen_random_uuid(),
  city_code text not null references public.cities(code),
  fee_minor integer not null check (fee_minor >= 0),
  minimum_order_minor integer not null default 0 check (minimum_order_minor >= 0),
  cutoff_hour integer not null default 14 check (cutoff_hour between 0 and 23),
  active boolean not null default true
);

create table if not exists public.inventory (
  variant_id uuid primary key references public.product_variants(id) on delete cascade,
  quantity integer not null default 0 check (quantity >= 0),
  reserved_quantity integer not null default 0 check (reserved_quantity >= 0),
  updated_at timestamptz not null default now(),
  check (reserved_quantity <= quantity)
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  display_number text not null unique,
  public_token text not null unique default encode(gen_random_bytes(24), 'hex'),
  customer_id uuid references public.profiles(id),
  customer_email text not null,
  customer_phone text not null,
  recipient_name text not null,
  recipient_phone text not null,
  delivery_address text not null,
  delivery_city_code text not null references public.cities(code),
  delivery_date date not null,
  delivery_window text not null,
  locale text not null default 'en' check (locale in ('en', 'ar')),
  subtotal_minor integer not null check (subtotal_minor >= 0),
  delivery_fee_minor integer not null check (delivery_fee_minor >= 0),
  total_minor integer not null check (total_minor >= 0),
  payment_status text not null default 'pending' check (payment_status in ('pending', 'payment_started', 'paid', 'payment_failed', 'cancelled', 'refunded')),
  fulfillment_status text not null default 'confirmed' check (fulfillment_status in ('confirmed', 'preparing', 'ready_for_delivery', 'out_for_delivery', 'delivered', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id),
  variant_id uuid references public.product_variants(id),
  product_slug text not null,
  product_name_en text not null,
  product_name_ar text not null default '',
  unit_price_minor integer not null check (unit_price_minor >= 0),
  quantity integer not null check (quantity > 0),
  add_ons jsonb not null default '[]'::jsonb,
  gift_message text not null default ''
);

create table if not exists public.inventory_reservations (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  variant_id uuid not null references public.product_variants(id),
  quantity integer not null check (quantity > 0),
  expires_at timestamptz not null,
  released_at timestamptz,
  created_at timestamptz not null default now(),
  unique(order_id, variant_id)
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  provider text not null default 'paymob',
  provider_reference text,
  idempotency_key text not null unique,
  amount_minor integer not null check (amount_minor >= 0),
  currency text not null default 'EGP',
  status text not null default 'pending',
  raw_event jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.order_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  actor_id uuid references public.profiles(id),
  event_type text not null,
  from_status text,
  to_status text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.orders(id) on delete cascade,
  type text not null,
  recipient text not null,
  locale text not null default 'en',
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create table if not exists public.admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id),
  action text not null,
  target_type text not null,
  target_id text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists products_active_idx on public.products(active, created_at desc);
create index if not exists orders_customer_idx on public.orders(customer_id, created_at desc);
create index if not exists order_events_order_idx on public.order_events(order_id, created_at desc);
create index if not exists notification_pending_idx on public.notification_deliveries(status, created_at);

alter table public.profiles enable row level security;
alter table public.products enable row level security;
alter table public.categories enable row level security;
alter table public.cities enable row level security;
alter table public.delivery_rules enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.order_events enable row level security;
alter table public.payments enable row level security;

create policy "public can read active products" on public.products for select using (active = true);
create policy "public can read active categories" on public.categories for select using (active = true);
create policy "public can read active cities" on public.cities for select using (active = true);
create policy "public can read active delivery rules" on public.delivery_rules for select using (active = true);
create policy "customers read own orders" on public.orders for select using (customer_id = auth.uid());
create policy "customers read own items" on public.order_items for select using (exists (select 1 from public.orders o where o.id = order_id and o.customer_id = auth.uid()));

create or replace function public.reserve_order_inventory(p_order_id uuid, p_items jsonb)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare item jsonb;
        changed integer;
begin
  for item in select * from jsonb_array_elements(p_items) loop
    update public.inventory
       set reserved_quantity = reserved_quantity + (item->>'quantity')::integer,
           updated_at = now()
     where variant_id = (item->>'variant_id')::uuid
       and quantity - reserved_quantity >= (item->>'quantity')::integer;
    get diagnostics changed = row_count;
    if changed <> 1 then
      raise exception 'INSUFFICIENT_STOCK';
    end if;
    insert into public.inventory_reservations(order_id, variant_id, quantity, expires_at)
    values (p_order_id, (item->>'variant_id')::uuid, (item->>'quantity')::integer, now() + interval '30 minutes');
  end loop;
  return true;
exception when others then
  for item in select * from jsonb_array_elements(p_items) loop
    update public.inventory
       set reserved_quantity = greatest(0, reserved_quantity - (item->>'quantity')::integer),
           updated_at = now()
     where variant_id = (item->>'variant_id')::uuid;
  end loop;
  delete from public.inventory_reservations where order_id = p_order_id;
  raise;
end;
$$;
