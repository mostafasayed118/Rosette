-- Customer wishlists. Customers may read their own rows (wishlist page).
-- Writes (save/remove/merge) run through the service-role route, which
-- validates the product and dedupes — no anon insert/delete policies.
create table if not exists public.wishlist_items (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  created_at timestamptz not null default now(),
  -- Language the customer was browsing when they saved (email language).
  locale text not null default 'en' check (locale in ('en', 'ar', 'fr')),
  -- Snapshots for the price-drop / back-in-stock cron (minor units / units).
  -- Default -1 = "uninitialized": the first cron run records real values and
  -- never emails (a real price >= 0 is never a drop from -1, and -1 stock is
  -- never a restock; a genuine restock fires only from a snapshot of 0).
  last_price_minor integer not null default -1,
  last_available_stock integer not null default -1,
  unique (customer_id, product_id)
);

create index if not exists wishlist_items_customer_idx on public.wishlist_items(customer_id);
create index if not exists wishlist_items_product_idx on public.wishlist_items(product_id);

alter table public.wishlist_items enable row level security;

create policy "customers read own wishlist" on public.wishlist_items
  for select using (customer_id = auth.uid());
