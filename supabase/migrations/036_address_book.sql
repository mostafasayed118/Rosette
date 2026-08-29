-- 036_address_book.sql
-- Saved delivery addresses per customer. Used by the account "Addresses"
-- panel and the checkout address picker. Customer-scoped like recipients
-- (018); the app reads/writes through the service-role admin client, RLS is
-- defense in depth.
create table if not exists public.address_book (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles(id) on delete cascade,
  label text not null,
  recipient_name text not null,
  recipient_phone text not null,
  address text not null,
  city_slug text not null,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  unique (customer_id, label)
);

create index if not exists address_book_customer_idx on public.address_book (customer_id, created_at);

alter table public.address_book enable row level security;

create policy "customers manage own addresses"
  on public.address_book
  for all
  using (auth.uid() = customer_id)
  with check (auth.uid() = customer_id);
