-- Complete the promotion model with free shipping and per-customer limits.
alter table public.promo_codes drop constraint if exists promo_codes_type_check;
alter table public.promo_codes add constraint promo_codes_type_check
  check (type in ('percent', 'fixed', 'free_shipping'));
alter table public.promo_codes add column if not exists per_user_limit integer not null default 0 check (per_user_limit >= 0);

create table if not exists public.promo_redemptions (
  id uuid primary key default gen_random_uuid(),
  promo_code_id uuid not null references public.promo_codes(id) on delete cascade,
  order_id uuid not null unique references public.orders(id) on delete cascade,
  customer_id uuid references public.profiles(id) on delete set null,
  redeemed_at timestamptz not null default now()
);

create index if not exists promo_redemptions_customer_idx
  on public.promo_redemptions(promo_code_id, customer_id, redeemed_at desc);

create or replace function public.enforce_promo_user_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_promo_id uuid;
  v_limit integer;
  v_count integer;
begin
  if new.promo_code is null or new.customer_id is null then
    return new;
  end if;

  select id, per_user_limit into v_promo_id, v_limit
    from public.promo_codes
   where code = new.promo_code;
  if v_promo_id is null or coalesce(v_limit, 0) = 0 then
    if v_promo_id is not null then
      insert into public.promo_redemptions(promo_code_id, order_id, customer_id)
      values (v_promo_id, new.id, new.customer_id);
    end if;
    return new;
  end if;

  select count(*)::integer into v_count
    from public.promo_redemptions
   where promo_code_id = v_promo_id and customer_id = new.customer_id;
  if v_count >= v_limit then
    raise exception 'PROMO_USER_LIMIT' using errcode = 'P0001';
  end if;

  insert into public.promo_redemptions(promo_code_id, order_id, customer_id)
  values (v_promo_id, new.id, new.customer_id);
  return new;
end;
$$;

drop trigger if exists orders_promo_user_limit_trigger on public.orders;
create trigger orders_promo_user_limit_trigger
after insert on public.orders
for each row execute function public.enforce_promo_user_limit();

alter table public.promo_redemptions enable row level security;
drop policy if exists "deny all" on public.promo_redemptions;
create policy "deny all" on public.promo_redemptions
  for all to anon, authenticated using (false) with check (false);
revoke all on public.promo_redemptions from public, anon, authenticated;
grant select, insert on public.promo_redemptions to service_role;
