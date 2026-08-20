create table if not exists public.gift_card_purchases (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  amount_minor integer not null check (amount_minor > 0),
  currency text not null default 'EGP',
  sender_name text not null,
  sender_email text not null,
  recipient_name text not null,
  recipient_email text not null,
  message text not null default '',
  locale text not null check (locale in ('en', 'ar', 'fr')),
  status text not null default 'pending' check (status in ('pending', 'paid', 'failed', 'cancelled')),
  provider_reference text unique,
  delivery_status text not null default 'pending' check (delivery_status in ('pending', 'sent', 'failed')),
  delivery_attempts integer not null default 0 check (delivery_attempts >= 0),
  last_delivery_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.gift_cards (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid unique references public.gift_card_purchases(id),
  code_hash text not null unique,
  code_ciphertext text not null,
  code_last4 text not null,
  initial_balance_minor integer not null check (initial_balance_minor > 0),
  balance_minor integer not null check (balance_minor >= 0),
  recipient_name text,
  recipient_email text,
  buyer_email text,
  locale text not null default 'en' check (locale in ('en', 'ar', 'fr')),
  status text not null check (status in ('active', 'depleted', 'expired', 'void')),
  expires_at timestamptz not null,
  issued_by uuid references public.profiles(id),
  delivery_status text not null default 'pending' check (delivery_status in ('pending', 'sent', 'failed')),
  delivery_attempts integer not null default 0 check (delivery_attempts >= 0),
  last_delivery_error text,
  delivery_claim_token text,
  delivery_claimed_at timestamptz,
  activated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.gift_card_holds (
  id uuid primary key default gen_random_uuid(),
  gift_card_id uuid not null references public.gift_cards(id),
  order_id uuid not null references public.orders(id) on delete cascade,
  amount_minor integer not null check (amount_minor > 0),
  status text not null default 'held' check (status in ('held', 'redeemed', 'released')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists gift_card_holds_active_order_card_idx
  on public.gift_card_holds(gift_card_id, order_id) where status = 'held';
create index if not exists gift_card_purchases_reference_idx on public.gift_card_purchases(reference);
create index if not exists gift_cards_status_expiry_idx on public.gift_cards(status, expires_at);
alter table public.gift_cards add column if not exists locale text not null default 'en' check (locale in ('en', 'ar', 'fr'));

create index if not exists gift_cards_recipient_email_idx on public.gift_cards(recipient_email);
create index if not exists gift_card_holds_status_expiry_idx on public.gift_card_holds(status, expires_at);

create table if not exists public.gift_card_transactions (
  id uuid primary key default gen_random_uuid(),
  gift_card_id uuid not null references public.gift_cards(id),
  type text not null check (type in ('issue', 'redeem', 'release', 'void', 'refund')),
  amount_minor integer not null check (amount_minor > 0),
  order_id uuid references public.orders(id),
  actor_id uuid references public.profiles(id),
  idempotency_key text not null unique,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists gift_card_transactions_card_idx on public.gift_card_transactions(gift_card_id, created_at desc);

alter table public.orders add column if not exists gift_card_minor integer not null default 0 check (gift_card_minor >= 0);
alter table public.orders add column if not exists gift_card_id uuid references public.gift_cards(id);
alter table public.orders add column if not exists gift_card_hold_id uuid references public.gift_card_holds(id);
alter table public.orders add column if not exists gift_card_code_last4 text;

alter table public.gift_cards add column if not exists delivery_claim_token text;
alter table public.gift_cards add column if not exists delivery_claimed_at timestamptz;

alter table public.gift_card_purchases enable row level security;
alter table public.gift_cards enable row level security;
alter table public.gift_card_holds enable row level security;
alter table public.gift_card_transactions enable row level security;

create or replace function public.claim_gift_card_delivery(
  p_card_id uuid,
  p_claim_token text,
  p_now timestamptz default now(),
  p_stale_after_seconds integer default 600
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_claim_token is null or p_claim_token = '' then return false; end if;
  update public.gift_cards
     set delivery_claim_token = p_claim_token,
         delivery_claimed_at = p_now,
         updated_at = p_now
   where id = p_card_id
     and delivery_status = 'pending'
     and (delivery_claim_token is null or delivery_claimed_at <= p_now - (greatest(p_stale_after_seconds, 0) * interval '1 second'));
  return found;
end;
$$;

create or replace function public.complete_gift_card_delivery(
  p_card_id uuid,
  p_claim_token text,
  p_status text,
  p_error text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_status not in ('sent', 'failed') then return false; end if;
  update public.gift_cards
     set delivery_status = p_status,
         delivery_attempts = delivery_attempts + 1,
         last_delivery_error = p_error,
         delivery_claim_token = null,
         delivery_claimed_at = null,
         updated_at = now()
   where id = p_card_id
     and delivery_claim_token = p_claim_token;
  return found;
end;
$$;

create or replace function public.reserve_gift_card(
  p_code_hash text,
  p_order_id uuid,
  p_amount_minor integer,
  p_expires_at timestamptz default now() + interval '30 minutes'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  card public.gift_cards%rowtype;
  hold_id uuid;
  expired_hold public.gift_card_holds%rowtype;
  reserved_minor integer;
begin
  if p_amount_minor <= 0 then raise exception 'INVALID_GIFT_CARD_AMOUNT'; end if;
  select * into card from public.gift_cards where code_hash = p_code_hash for update;
  if not found then raise exception 'INVALID_GIFT_CARD'; end if;
  if card.expires_at <= now() then
    update public.gift_cards set status = 'expired', updated_at = now() where id = card.id;
    raise exception 'INVALID_GIFT_CARD';
  end if;
  if card.status <> 'active' then raise exception 'INVALID_GIFT_CARD'; end if;
  for expired_hold in select * from public.gift_card_holds where gift_card_id = card.id and status = 'held' and expires_at <= now() for update loop
    update public.gift_card_holds set status = 'released', updated_at = now() where id = expired_hold.id;
    insert into public.gift_card_transactions(gift_card_id, type, amount_minor, order_id, idempotency_key, metadata)
    values (card.id, 'release', expired_hold.amount_minor, expired_hold.order_id, 'gift-card-expired-release:' || expired_hold.id, jsonb_build_object('hold_id', expired_hold.id))
    on conflict (idempotency_key) do nothing;
  end loop;
  select coalesce(sum(amount_minor), 0) into reserved_minor from public.gift_card_holds where gift_card_id = card.id and status = 'held' and expires_at > now();
  if card.balance_minor - reserved_minor < p_amount_minor then raise exception 'INVALID_GIFT_CARD'; end if;
  if exists (select 1 from public.gift_card_holds where gift_card_id = card.id and order_id = p_order_id and status = 'held') then
    raise exception 'GIFT_CARD_ALREADY_HELD';
  end if;
  insert into public.gift_card_holds(gift_card_id, order_id, amount_minor, status, expires_at)
  values (card.id, p_order_id, p_amount_minor, 'held', p_expires_at)
  returning id into hold_id;
  return hold_id;
end;
$$;

create or replace function public.redeem_gift_card_hold(p_hold_id uuid, p_idempotency_key text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  hold public.gift_card_holds%rowtype;
  card public.gift_cards%rowtype;
begin
  if exists (select 1 from public.gift_card_transactions where idempotency_key = p_idempotency_key) then return true; end if;
  select * into hold from public.gift_card_holds where id = p_hold_id for update;
  if not found then raise exception 'GIFT_CARD_HOLD_NOT_FOUND'; end if;
  select * into card from public.gift_cards where id = hold.gift_card_id for update;
  if hold.status = 'redeemed' then return true; end if;
  if hold.status <> 'held' or hold.expires_at <= now() then raise exception 'GIFT_CARD_HOLD_EXPIRED'; end if;
  if card.status not in ('active', 'depleted') or card.balance_minor < hold.amount_minor then raise exception 'INVALID_GIFT_CARD'; end if;
  update public.gift_cards
     set balance_minor = balance_minor - hold.amount_minor,
         status = case when balance_minor - hold.amount_minor = 0 then 'depleted' else 'active' end,
         updated_at = now()
   where id = card.id;
  update public.gift_card_holds set status = 'redeemed', updated_at = now() where id = hold.id;
  insert into public.gift_card_transactions(gift_card_id, type, amount_minor, order_id, idempotency_key, metadata)
  values (card.id, 'redeem', hold.amount_minor, hold.order_id, p_idempotency_key, jsonb_build_object('hold_id', hold.id));
  return true;
end;
$$;

create or replace function public.release_gift_card_hold(p_hold_id uuid, p_idempotency_key text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  hold public.gift_card_holds%rowtype;
begin
  if exists (select 1 from public.gift_card_transactions where idempotency_key = p_idempotency_key) then return true; end if;
  select * into hold from public.gift_card_holds where id = p_hold_id for update;
  if not found then return true; end if;
  if hold.status <> 'held' then return true; end if;
  update public.gift_card_holds set status = 'released', updated_at = now() where id = hold.id;
  insert into public.gift_card_transactions(gift_card_id, type, amount_minor, order_id, idempotency_key, metadata)
  values (hold.gift_card_id, 'release', hold.amount_minor, hold.order_id, p_idempotency_key, jsonb_build_object('hold_id', hold.id));
  return true;
end;
$$;

create or replace function public.refund_gift_card_redemption(
  p_gift_card_id uuid,
  p_order_id uuid,
  p_amount_minor integer,
  p_idempotency_key text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  card public.gift_cards%rowtype;
begin
  if p_amount_minor <= 0 then raise exception 'INVALID_GIFT_CARD_AMOUNT'; end if;
  if exists (select 1 from public.gift_card_transactions where idempotency_key = p_idempotency_key) then return true; end if;
  select * into card from public.gift_cards where id = p_gift_card_id for update;
  if not found or card.status = 'void' or card.balance_minor + p_amount_minor > card.initial_balance_minor then raise exception 'INVALID_GIFT_CARD_REFUND'; end if;
  update public.gift_cards set balance_minor = balance_minor + p_amount_minor, status = 'active', updated_at = now() where id = card.id;
  insert into public.gift_card_transactions(gift_card_id, type, amount_minor, order_id, idempotency_key, metadata)
  values (card.id, 'refund', p_amount_minor, p_order_id, p_idempotency_key, '{}'::jsonb);
  return true;
end;
$$;
