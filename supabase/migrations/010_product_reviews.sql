create table if not exists public.product_reviews (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  -- Nullable only so the seed can ship demo reviews without fabricating
  -- profiles/orders; every real review sets both.
  order_id uuid references public.orders(id) on delete cascade,
  customer_id uuid references public.profiles(id),
  rating integer not null check (rating between 1 and 5),
  body text not null check (char_length(body) between 1 and 400),
  status text not null default 'pending' check (status in ('pending', 'approved')),
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (order_id, product_id)
);

create index if not exists product_reviews_product_idx on public.product_reviews(product_id);
create index if not exists product_reviews_status_idx on public.product_reviews(status);
create index if not exists product_reviews_customer_idx on public.product_reviews(customer_id);

alter table public.product_reviews enable row level security;

-- Storefront (anon): approved reviews are readable by everyone.
create policy "anyone reads approved reviews" on public.product_reviews
  for select using (status = 'approved');

-- Customers may read their own rows (e.g. to see a pending review).
create policy "customers read own reviews" on public.product_reviews
  for select using (customer_id = auth.uid());
