create table if not exists public.wishlist_items (
  customer_id uuid not null references public.profiles(id) on delete cascade,
  product_slug text not null references public.products(slug) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (customer_id, product_slug)
);

alter table public.wishlist_items enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='wishlist_items' and policyname='owners manage own wishlist') then
    create policy "owners manage own wishlist" on public.wishlist_items
      for all using (customer_id = auth.uid()) with check (customer_id = auth.uid());
  end if;
end $$;
create index if not exists wishlist_customer_idx on public.wishlist_items(customer_id, added_at desc);

create or replace function public.get_personalized_picks(
  p_customer_id uuid,
  p_limit int default 8,
  p_exclude_slug text default null
) returns table (slug text, score int, reason text)
language sql security definer set search_path = public as $$
  with customer_orders as (
    select id from public.orders
    where customer_id = p_customer_id and payment_status in ('paid','payment_started')
  ),
  item_slugs as (
    select product_slug, count(*)::int as freq
    from public.order_items where order_id in (select id from customer_orders)
    group by product_slug
  ),
  wishlist_slugs as (
    select product_slug from public.wishlist_items where customer_id = p_customer_id
  ),
  -- combined signals for category/occasion counts (orders weighted 2x wishlist 1x)
  product_signals as (
    select p.slug, p.category, p.occasions, p.created_at, p.active,
           coalesce(i.freq,0) as freq,
           case when w.product_slug is not null then 1 else 0 end as wished
    from public.products p
    left join item_slugs i on i.product_slug = p.slug
    left join wishlist_slugs w on w.product_slug = p.slug
  ),
  category_counts as (
    select category, sum(freq*2 + wished) as cscore
    from product_signals where freq>0 or wished=1 group by category
  ),
  occasion_counts as (
    select occ, sum(freq*2 + wished) as oscore
    from product_signals, unnest(occasions) as occ
    where freq>0 or wished=1 group by occ
  ),
  scored as (
    select ps.slug,
           coalesce(cc.cscore,0)*2 + coalesce( (select sum(oscore) from occasion_counts oc where oc.occ = any(ps.occasions)), 0) as score,
           ps.freq, ps.created_at, ps.active
    from product_signals ps
    left join category_counts cc on cc.category = ps.category
  ),
  buy_again as (
    select slug, 1000 + freq as score, 'buy_again'::text as reason
    from scored where freq>0 and active and slug <> coalesce(p_exclude_slug,'')
    order by freq desc, created_at desc limit p_limit
  ),
  affinity as (
    select slug, score, 'affinity'::text as reason
    from scored where active and slug not in (select slug from buy_again)
      and slug <> coalesce(p_exclude_slug,'')
      and score > 0
    order by score desc, created_at desc limit p_limit
  ),
  fallback as (
    select slug, 0 as score, 'fallback_newest'::text as reason
    from public.products where active and slug not in (select slug from buy_again) and slug not in (select slug from affinity)
      and slug <> coalesce(p_exclude_slug,'')
    order by created_at desc limit p_limit
  ),
  combined as (
    select * from buy_again
    union all
    select * from affinity
    union all
    select * from fallback
  )
  select slug, score, reason from combined limit p_limit;
$$;
