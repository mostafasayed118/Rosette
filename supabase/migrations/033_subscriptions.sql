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

-- Bundle purchase: INSERT the order (full price, no inventory reservation),
-- INSERT the subscription row, honour gift-card holds/promo, default to pending
-- unless a gift card or zero-total path marks it paid. The app owns price/validation;
-- the DB owns write integrity of the decided values.

create or replace function public.create_subscription_order(
  p_checkout jsonb,
  p_lines jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id uuid;
  v_subscription_id uuid;
  v_display_number text;
  v_public_token text;
  v_hold_id uuid;
  v_total_minor int := (p_checkout->>'totalMinor')::int;
  v_gift_card_amount int := coalesce((p_checkout->>'giftCardMinor')::int, 0);
  v_gift_card_code_hash text := nullif(p_checkout->>'giftCardCodeHash', '');
  v_gift_card_id text := nullif(p_checkout->>'giftCardId', '');
  v_gift_card_code_last4 text := nullif(p_checkout->>'giftCardCodeLast4', '');
  v_line jsonb;
begin
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'EMPTY_CART';
  end if;
  if v_total_minor < 0 or v_gift_card_amount < 0 then
    raise exception 'INVALID_AMOUNT';
  end if;

  v_display_number := 'RO-' || upper(to_hex(extract(epoch from clock_timestamp())::bigint)) || '-' || upper(substring(md5(random()::text) for 4));
  v_public_token := encode(extensions.gen_random_bytes(24), 'hex');

  insert into public.orders(
    display_number, public_token, customer_id,
    customer_email, customer_phone, recipient_name, recipient_phone,
    delivery_address, delivery_city_code, delivery_date, delivery_window, locale,
    subtotal_minor, delivery_fee_minor, total_minor, discount_minor, promo_code,
    gift_card_minor, gift_card_id, gift_card_code_last4
  ) values (
    v_display_number, v_public_token, nullif(p_checkout->>'customerId', '')::uuid,
    p_checkout->>'customerEmail', p_checkout->>'customerPhone', p_checkout->>'recipientName', p_checkout->>'recipientPhone',
    p_checkout->>'deliveryAddress', p_checkout->>'cityCode', (p_checkout->>'deliveryDate')::date, p_checkout->>'deliveryWindow',
    coalesce(p_checkout->>'locale', 'en'),
    (p_checkout->>'subtotalMinor')::int, 0, v_total_minor,
    coalesce((p_checkout->>'discountMinor')::int, 0), nullif(p_checkout->>'promoCode', ''),
    v_gift_card_amount, nullif(v_gift_card_id, '')::uuid, v_gift_card_code_last4
  ) returning id into v_order_id;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    insert into public.order_items(
      order_id, product_id, variant_id, product_slug,
      product_name_en, product_name_ar, product_name_fr,
      unit_price_minor, quantity, add_ons, gift_message
    ) values (
      v_order_id, null, null, v_line->>'productSlug',
      v_line->>'productName', coalesce(v_line->>'productNameAr', ''), coalesce(v_line->>'productNameFr', ''),
      (v_line->>'unitPrice')::int, (v_line->>'quantity')::int,
      coalesce(v_line->'addOns', '[]'::jsonb), coalesce(v_line->>'message', '')
    );
  end loop;

  insert into public.subscriptions(
    customer_id, plan_id, product_id, variant_id, status, frequency,
    bundle_size, price_minor, locale,
    recipient_name, recipient_phone, delivery_address, delivery_city_code,
    delivery_window, gift_message, first_delivery_date, checkout_order_id
  ) values (
    nullif(p_checkout->>'customerId', '')::uuid,
    nullif(p_checkout->>'planId', '')::uuid,
    nullif(p_checkout->>'productId', '')::uuid,
    nullif(p_checkout->>'variantId', '')::uuid,
    'pending_payment',
    p_checkout->>'frequency',
    (p_checkout->>'bundleSize')::int,
    v_total_minor,
    coalesce(p_checkout->>'locale', 'en'),
    p_checkout->>'recipientName', p_checkout->>'recipientPhone', p_checkout->>'deliveryAddress', p_checkout->>'cityCode',
    p_checkout->>'deliveryWindow', coalesce(p_checkout->>'giftMessage', ''), (p_checkout->>'deliveryDate')::date,
    v_order_id
  ) returning id into v_subscription_id;

  update public.orders set subscription_id = v_subscription_id where id = v_order_id;

  if v_gift_card_code_hash is not null and v_gift_card_amount > 0 then
    v_hold_id := public.reserve_gift_card(v_gift_card_code_hash, v_order_id, v_gift_card_amount);
    update public.orders set gift_card_hold_id = v_hold_id where id = v_order_id;
    if v_total_minor = 0 then
      perform public.redeem_gift_card_hold(v_hold_id, 'gift-card-zero:' || v_order_id::text);
      update public.orders set payment_status = 'paid' where id = v_order_id;
      insert into public.payments(order_id, provider, provider_reference, idempotency_key, amount_minor, currency, status)
      values (v_order_id, 'gift_card', null, 'gift-card-zero-payment:' || v_order_id::text, 0, 'EGP', 'paid');
    end if;
  end if;

  if nullif(p_checkout->>'promoCode', '') is not null then
    perform public.increment_promo_usage(p_checkout->>'promoCode');
  end if;

  return jsonb_build_object(
    'order', (select row_to_json(o) from public.orders o where id = v_order_id),
    'subscription_id', v_subscription_id,
    'gift_card_hold_id', v_hold_id
  );
end;
$$;
grant execute on function public.create_subscription_order(jsonb, jsonb) to service_role;

-- pending_payment -> active, generating one subscription_deliveries row per
-- pre-computed p_dates entry (JSON array of 'YYYY-MM-DD' strings from schedule.ts).
-- Idempotent via the existing-rows guard.

create or replace function public.activate_subscription(
  p_subscription_id uuid,
  p_dates jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sub record;
  v_has_rows boolean;
  v_idx int;
  v_date text;
begin
  select * into v_sub from public.subscriptions where id = p_subscription_id;
  if v_sub.id is null then raise exception 'SUBSCRIPTION_NOT_FOUND'; end if;
  select exists(select 1 from public.subscription_deliveries where subscription_id = p_subscription_id and status <> 'cancelled') into v_has_rows;
  if v_has_rows then
    if v_sub.status = 'pending_payment' then
      update public.subscriptions set status = 'active', updated_at = now() where id = p_subscription_id;
      insert into public.subscription_events(subscription_id, actor, event_type, payload)
      values (p_subscription_id, 'system', 'activated', jsonb_build_object('to', 'active'));
    end if;
    return jsonb_build_object('status', 'already_activated');
  end if;
  if v_sub.status <> 'pending_payment' then raise exception 'SUBSCRIPTION_NOT_PENDING'; end if;
  update public.subscriptions set status = 'active', updated_at = now() where id = p_subscription_id;
  v_idx := 1;
  for v_date in select jsonb_array_elements_text(p_dates) loop
    insert into public.subscription_deliveries(subscription_id, position, scheduled_date, status)
    values (p_subscription_id, v_idx, v_date::date, 'scheduled');
    v_idx := v_idx + 1;
  end loop;
  insert into public.subscription_events(subscription_id, actor, event_type, payload)
  values (p_subscription_id, 'system', 'activated', jsonb_build_object('to', 'active', 'deliveries', jsonb_array_length(p_dates)));
  return jsonb_build_object('status', 'activated', 'deliveries', v_idx - 1);
end;
$$;
grant execute on function public.activate_subscription(uuid, jsonb) to service_role;
