-- Healing + spec for wishlist_items
create table if not exists public.wishlist_items (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles(id) on delete cascade,
  product_id uuid references public.products(id) on delete cascade,
  product_slug text references public.products(slug) on delete cascade,
  created_at timestamptz not null default now(),
  added_at timestamptz not null default now(),
  locale text not null default 'en' check (locale in ('en','ar','fr')),
  last_price_minor integer not null default -1,
  last_available_stock integer not null default -1,
  unique (customer_id, product_id),
  unique (customer_id, product_slug)
);

-- Add columns if table already existed (legacy 012)
alter table public.wishlist_items add column if not exists product_slug text;
alter table public.wishlist_items add column if not exists added_at timestamptz not null default now();
alter table public.wishlist_items add column if not exists product_id uuid references public.products(id) on delete cascade;
-- Heal legacy NOT NULL on product_id so slug-only inserts (Task 4) succeed
alter table public.wishlist_items alter column product_id drop not null;

-- Backfill product_slug from product_id where null, and product_id from product_slug where null
update public.wishlist_items wi set product_slug = p.slug from public.products p where wi.product_id = p.id and wi.product_slug is null and wi.product_id is not null;
update public.wishlist_items wi set product_id = p.id from public.products p where wi.product_slug = p.slug and wi.product_id is null and wi.product_slug is not null;

-- Ensure FK exists for product_slug if not
do $$ begin if not exists (select 1 from pg_constraint where conname='wishlist_items_product_slug_fkey') then alter table public.wishlist_items add constraint wishlist_items_product_slug_fkey foreign key (product_slug) references public.products(slug) on delete cascade; end if; end $$;

alter table public.wishlist_items enable row level security;
do $$ begin if not exists (select 1 from pg_policies where tablename='wishlist_items' and policyname='owners manage own wishlist') then create policy "owners manage own wishlist" on public.wishlist_items for all using (customer_id = auth.uid()) with check (customer_id = auth.uid()); end if; end $$;
-- keep legacy select policy idempotent
do $$ begin if not exists (select 1 from pg_policies where tablename='wishlist_items' and policyname='customers read own wishlist') then create policy "customers read own wishlist" on public.wishlist_items for select using (customer_id = auth.uid()); end if; end $$;

create index if not exists wishlist_customer_idx on public.wishlist_items(customer_id, added_at desc);
create index if not exists wishlist_customer_created_idx on public.wishlist_items(customer_id, created_at desc);
create index if not exists wishlist_product_slug_idx on public.wishlist_items(product_slug);
create unique index if not exists wishlist_items_customer_slug_unique on public.wishlist_items(customer_id, product_slug) where product_slug is not null;

-- RPC: get_personalized_picks with auth gate + wishlist slug coalesce
create or replace function public.get_personalized_picks(
  p_customer_id uuid,
  p_limit int default 8,
  p_exclude_slug text default null
) returns table (slug text, score int, reason text)
language plpgsql security definer set search_path = public as $$
begin
  if p_customer_id is distinct from auth.uid() and auth.role() <> 'service_role' then raise exception 'forbidden: p_customer_id must equal auth.uid()' using errcode='42501'; end if;
  return query
  with customer_orders as (
    select id from public.orders where customer_id = p_customer_id and payment_status in ('paid','payment_started')
  ),
  item_slugs as (
    select product_slug, count(*)::int as freq from public.order_items where order_id in (select id from customer_orders) group by product_slug
  ),
  wishlist_slugs as (
    select coalesce(wi.product_slug, p.slug) as product_slug
    from public.wishlist_items wi
    left join public.products p on p.id = wi.product_id
    where wi.customer_id = p_customer_id and coalesce(wi.product_slug, p.slug) is not null
  ),
  product_signals as (
    select p.slug, p.category, p.occasions, p.created_at, p.active, coalesce(i.freq,0) as freq, case when w.product_slug is not null then 1 else 0 end as wished
    from public.products p
    left join item_slugs i on i.product_slug = p.slug
    left join wishlist_slugs w on w.product_slug = p.slug
  ),
  category_counts as (
    select category, sum(freq*2 + wished) as cscore from product_signals where freq>0 or wished=1 group by category
  ),
  occasion_counts as (
    select occ, sum(freq*2 + wished) as oscore from product_signals, unnest(occasions) as occ where freq>0 or wished=1 group by occ
  ),
  scored as (
    select ps.slug, (coalesce(cc.cscore,0)*2 + coalesce((select sum(oscore) from occasion_counts oc where oc.occ = any(ps.occasions)),0))::int as score, ps.freq, ps.created_at, ps.active
    from product_signals ps left join category_counts cc on cc.category = ps.category
  ),
  buy_again as (
    select scored.slug, 1000+scored.freq as score, 'buy_again'::text as reason from scored where scored.freq>0 and scored.active and scored.slug <> coalesce(p_exclude_slug,'') order by scored.freq desc, scored.created_at desc limit p_limit
  ),
  affinity as (
    select scored.slug, scored.score, 'affinity'::text as reason from scored where scored.active and scored.slug not in (select buy_again.slug from buy_again) and scored.slug <> coalesce(p_exclude_slug,'') and scored.score>0 order by scored.score desc, scored.created_at desc limit p_limit
  ),
  fallback as (
    select products.slug, 0 as score, 'fallback_newest'::text as reason from public.products where products.active and products.slug not in (select buy_again.slug from buy_again) and products.slug not in (select affinity.slug from affinity) and products.slug <> coalesce(p_exclude_slug,'') order by products.created_at desc limit p_limit
  ),
  combined as (select * from buy_again union all select * from affinity union all select * from fallback)
  select combined.slug, combined.score, combined.reason from combined limit p_limit;
end; $$;

revoke execute on function public.get_personalized_picks(uuid, int, text) from public, anon, authenticated;
grant execute on function public.get_personalized_picks(uuid, int, text) to service_role;
-- if direct authenticated RPC is desired, also: grant execute on function public.get_personalized_picks(uuid,int,text) to authenticated;
