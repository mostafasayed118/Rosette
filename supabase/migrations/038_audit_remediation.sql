-- 038_audit_remediation.sql
--
-- Closes five defects confirmed by reading the SQL in this repository (they
-- are NOT fixed anywhere else in the migration tree):
--   1. inventory_reservations rows are written by 001_commerce.sql:208 with a
--      30-minute TTL and never released — no cron, no function and no
--      application code references the table, so `inventory.reserved_quantity`
--      creeps up forever until the `reserved_quantity <= quantity` check makes
--      the variant unsellable.
--   2. materialize_subscription_delivery (037) has a TOCTOU window, selects a
--      non-existent column (`product_variants.price_minor`) and, separately,
--      reads `v_delivery.scheduled_date` from a record that never selected it —
--      both are PL/pgSQL run-time errors, so the function fails on every call.
--   3. Missing indexes: order_items.order_id and five filtered orders columns.
--   4. upsert_cart (026) claims to use INSERT ... ON CONFLICT but is a
--      read-then-write with the same race the migration set out to remove.
--   5. promo_codes is SELECT-granted to anon/authenticated by 028, exposing
--      max_uses / used_count (redemption headroom) to any visitor.
--
-- Conventions follow 028_hardened_privileges.sql: every new function is
-- `security definer set search_path = public`, EXECUTE is revoked from
-- PUBLIC/anon/authenticated and granted only to service_role. Every statement
-- is idempotent (`if not exists` / `create or replace` / plain grant-revoke),
-- so the migration is safe to re-run.
--
-- ── NOTE ON SCHEDULING ────────────────────────────────────────────────────
-- supabase/config.toml declares no `[cron]` section and no pg_cron, so this
-- migration cannot rely on a database scheduler existing. Section 1c therefore
-- registers a pg_cron job only when the extension is already installed, and
-- the authoritative trigger is the HTTP cron endpoint added alongside this
-- file (app/api/cron/inventory/route.ts + .github/workflows/cron-inventory.yml),
-- which mirrors the existing cron routes and their per-job secret auth.
-- If pg_cron is later enabled, the section 1c block picks it up on the next
-- run without any edit — delete the HTTP trigger at that point to avoid
-- running the sweep twice.

-- ── 1a. Expired-reservation sweep index ───────────────────────────────────
-- The sweep filters `expires_at <= now()`; without this index every run
-- seq-scans the whole table.
create index if not exists inventory_reservations_expires_idx
  on public.inventory_reservations (expires_at);

-- ── 1b. release_expired_reservations ──────────────────────────────────────
-- Exact inverse of reserve_order_inventory (001:199-209): that function does
-- `reserved_quantity = reserved_quantity + qty` per line and inserts one
-- reservation row; this one subtracts the same quantity back and deletes the
-- reservation row. The `greatest(0, ...)` clamp and the `updated_at = now()`
-- write are copied verbatim from 001's own rollback handler (001:214-217) so
-- the two paths cannot drift.
--
-- `for update skip locked` lets two overlapping sweeps share the work instead
-- of blocking each other; rows are processed oldest-first so nothing starves.
--
-- SCOPE CAVEAT (deliberate, not an oversight): this releases every expired
-- reservation, including one belonging to an already-paid order. There is no
-- other code path in the repository that ever releases a reservation or
-- decrements `inventory.quantity` on fulfilment, so a paid order's hold is
-- indistinguishable from an abandoned one and holding it forever reproduces
-- the leak this fixes. If the business decides paid, not-yet-delivered orders
-- must keep their hold, add this predicate to the sweep query:
--   and not exists (select 1 from public.orders o
--                    where o.id = r.order_id
--                      and o.payment_status = 'paid'
--                      and o.fulfillment_status not in ('delivered','cancelled'))
create or replace function public.release_expired_reservations(p_batch_size integer default 500)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch integer := coalesce(p_batch_size, 500);
  v_reservation record;
  v_released integer := 0;
  v_variants integer := 0;
begin
  if v_batch < 1 then
    v_batch := 500;
  end if;

  for v_reservation in
    select r.id, r.variant_id, r.quantity
      from public.inventory_reservations r
     where r.expires_at <= now()
     order by r.expires_at
     limit v_batch
       for update of r skip locked
  loop
    update public.inventory
       set reserved_quantity = greatest(0, reserved_quantity - v_reservation.quantity),
           updated_at = now()
     where variant_id = v_reservation.variant_id;

    if found then
      v_variants := v_variants + 1;
    end if;

    delete from public.inventory_reservations where id = v_reservation.id;
    v_released := v_released + 1;
  end loop;

  return jsonb_build_object(
    'released', v_released,
    'variants_updated', v_variants,
    'swept_at', now()
  );
end;
$$;

revoke execute on function public.release_expired_reservations(integer)
  from public, anon, authenticated;
grant execute on function public.release_expired_reservations(integer)
  to service_role;

-- ── 1c. pg_cron registration (best-effort) ────────────────────────────────
-- Runs only when pg_cron is installed; any failure is downgraded to a NOTICE
-- so the migration never aborts over an optional scheduler. Re-running
-- reschedules the job cleanly rather than creating a duplicate.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'release-expired-reservations';
    perform cron.schedule(
      'release-expired-reservations',
      '*/5 * * * *',
      'select public.release_expired_reservations(500)'
    );
  else
    raise notice 'pg_cron not installed — reservation sweep is triggered by app/api/cron/inventory';
  end if;
exception when others then
  raise notice 'pg_cron scheduling skipped: %', sqlerrm;
end;
$$;

-- ── 2. materialize_subscription_delivery ──────────────────────────────────
-- Three fixes, all verified against the schema:
--   (a) TOCTOU: `for update` on the initial delivery select serialises
--       concurrent invocations, and `get diagnostics` on the final status
--       update aborts (rolling back the order, its item and the inventory
--       reservation) when the row was claimed by someone else. 40001 is the
--       retryable serialization_failure code.
--   (b) Dead + broken statement removed: `select coalesce(price_minor, 0)
--       from public.product_variants` — product_variants (001:36-43, plus
--       name_fr from 003) has no price_minor column, so that statement raised
--       undefined_column on every call; v_price_minor was then never used.
--       Nothing substitutes for it: the order is intentionally zero-total
--       (money is booked at bundle purchase) and order_items.unit_price_minor
--       stays 0, exactly as before.
--   (c) `scheduled_date` is now selected into v_delivery — the previous body
--       read v_delivery.scheduled_date (:350) from a record whose select
--       (:324) never included it, which is a run-time "record has no field"
--       error. Same class of defect as (b), same fix.
--   (d) order_items.product_slug now carries products.slug instead of
--       products.name_en.
create or replace function public.materialize_subscription_delivery(
  p_subscription_id uuid,
  p_delivery_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_delivery record;
  v_sub record;
  v_product record;
  v_customer_email text;
  v_order_id uuid;
  v_display_number text;
  v_public_token text;
  v_updated integer;
begin
  select d.id, d.position, d.scheduled_date, d.status as dstatus into v_delivery
    from public.subscription_deliveries d
   where d.id = p_delivery_id and d.subscription_id = p_subscription_id
     for update;
  if v_delivery.id is null then return jsonb_build_object('status', 'not_found'); end if;
  if v_delivery.dstatus <> 'scheduled' then return jsonb_build_object('status', 'already_ordered'); end if;

  select s.product_id, s.variant_id, s.locale, s.customer_id, s.recipient_name, s.recipient_phone,
         s.delivery_address, s.delivery_city_code, s.delivery_window, s.gift_message
    into v_sub from public.subscriptions s where s.id = p_subscription_id and s.status = 'active';
  if v_sub.product_id is null then return jsonb_build_object('status', 'not_active'); end if;

  select coalesce(p.email, '') into v_customer_email from public.profiles p where p.id = v_sub.customer_id;

  select p.slug, p.name_en, p.name_ar, p.name_fr into v_product
    from public.products p where p.id = v_sub.product_id;

  v_display_number := 'RO-' || upper(to_hex(extract(epoch from clock_timestamp())::bigint)) || '-' || upper(substring(md5(random()::text) for 4));
  v_public_token := encode(extensions.gen_random_bytes(24), 'hex');

  insert into public.orders(
    display_number, public_token, customer_id, customer_email, customer_phone,
    recipient_name, recipient_phone, delivery_address, delivery_city_code, delivery_date, delivery_window, locale,
    subtotal_minor, delivery_fee_minor, total_minor, discount_minor,
    payment_status, fulfillment_status, subscription_id, subscription_delivery_id
  ) values (
    v_display_number, v_public_token, v_sub.customer_id, coalesce(v_customer_email, ''), '',
    v_sub.recipient_name, v_sub.recipient_phone, v_sub.delivery_address, v_sub.delivery_city_code, v_delivery.scheduled_date, v_sub.delivery_window, v_sub.locale,
    0, 0, 0, 0, 'paid', 'confirmed', p_subscription_id, p_delivery_id
  ) returning id into v_order_id;

  insert into public.order_items(
    order_id, product_id, variant_id, product_slug, product_name_en, product_name_ar, product_name_fr,
    unit_price_minor, quantity, add_ons, gift_message
  ) values (
    v_order_id, v_sub.product_id, v_sub.variant_id, coalesce(v_product.slug, ''),
    coalesce(v_product.name_en, ''), coalesce(v_product.name_ar, ''), coalesce(v_product.name_fr, ''),
    0, 1, '[]'::jsonb, coalesce(v_sub.gift_message, '')
  );

  perform public.reserve_order_inventory(v_order_id, jsonb_build_array(jsonb_build_object('variant_id', v_sub.variant_id, 'quantity', 1)));

  update public.subscription_deliveries set status = 'ordered', order_id = v_order_id, updated_at = now()
   where id = p_delivery_id and status = 'scheduled';
  get diagnostics v_updated = row_count;

  if v_updated <> 1 then
    -- Rolls back the order, the order item and the inventory reservation
    -- created above. A retry finds status = 'ordered' and returns
    -- 'already_ordered', so the caller can safely re-run.
    raise exception 'DELIVERY_ALREADY_MATERIALIZED'
      using errcode = '40001',
            detail = format('delivery %s changed status concurrently; order %s rolled back', p_delivery_id, v_order_id),
            hint = 'Re-read the delivery; it is already ordered or cancelled.';
  end if;

  insert into public.order_events(order_id, event_type, from_status, to_status, metadata)
  values (v_order_id, 'subscription_materialized', 'scheduled', 'ordered',
          jsonb_build_object('subscription_id', p_subscription_id, 'delivery_position', v_delivery.position));
  insert into public.subscription_events(subscription_id, delivery_id, actor, event_type, payload)
  values (p_subscription_id, p_delivery_id, 'system', 'materialized', jsonb_build_object('order_id', v_order_id, 'position', v_delivery.position));

  return jsonb_build_object('status', 'ordered', 'order_id', v_order_id);
end;
$$;

revoke execute on function public.materialize_subscription_delivery(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.materialize_subscription_delivery(uuid, uuid)
  to service_role;

-- ── 3. Missing indexes ────────────────────────────────────────────────────
-- order_items.order_id is an FK (001:96) that Postgres does not auto-index.
-- Every order-detail embed and the `on delete cascade` from orders seq-scan
-- without it.
create index if not exists order_items_order_idx
  on public.order_items (order_id);

-- The admin orders list filters on status and sorts created_at desc; order
-- tracking and the occasions cron filter the remaining three.
create index if not exists orders_payment_status_idx
  on public.orders (payment_status, created_at desc);
create index if not exists orders_fulfillment_status_idx
  on public.orders (fulfillment_status, created_at desc);
create index if not exists orders_customer_email_idx
  on public.orders (customer_email);
create index if not exists orders_recipient_phone_idx
  on public.orders (recipient_phone);
create index if not exists orders_delivery_date_idx
  on public.orders (delivery_date);

-- ── 4. upsert_cart — genuine single-statement upsert ──────────────────────
-- 026's header promised INSERT ... ON CONFLICT but the body was
-- `select id into v_existing_id` followed by update-or-insert, which only
-- moved the race from JS into PL/pgSQL: two concurrent saves both see
-- v_existing_id IS NULL and both insert, the second one violating
-- carts_email_active_idx and losing the customer's saved bag.
--
-- The conflict target is that partial unique index —
--   carts_email_active_idx on public.carts (email) where converted_at is null
-- (013:18-19) — which is the *only* uniqueness protecting the active row, so
-- `(email) where converted_at is null` is the correct arbiter.
--
-- customer_id is carried across with coalesce(excluded.customer_id, ...) so a
-- guest save can never unlink a cart that already belongs to a customer while
-- a signed-in save still claims the row (the login-time link the cart sync is
-- there for). The empty-lines delete branch is unchanged.
create or replace function public.upsert_cart(
  p_email text,
  p_customer_id uuid,
  p_locale text,
  p_city text,
  p_lines jsonb,
  p_restore_token text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    if p_customer_id is not null then
      delete from public.carts
       where email = p_email
         and customer_id = p_customer_id
         and converted_at is null;
    else
      delete from public.carts
       where email = p_email
         and customer_id is null
         and converted_at is null;
    end if;
    return jsonb_build_object('status', 'ok', 'restore_token', '');
  end if;

  insert into public.carts(email, customer_id, locale, city, lines, restore_token, updated_at)
  values (p_email, p_customer_id, p_locale, p_city, p_lines, p_restore_token, now())
  on conflict (email) where converted_at is null
  do update set
    customer_id   = coalesce(excluded.customer_id, carts.customer_id),
    locale        = excluded.locale,
    city          = excluded.city,
    lines         = excluded.lines,
    restore_token = excluded.restore_token,
    updated_at    = now();

  return jsonb_build_object('status', 'ok', 'restore_token', p_restore_token);
end;
$$;

revoke execute on function public.upsert_cart(text, uuid, text, text, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.upsert_cart(text, uuid, text, text, jsonb, text)
  to service_role;

-- ── 5. promo_codes: stop exposing redemption headroom ─────────────────────
-- 028 re-granted SELECT on promo_codes to anon/authenticated, so
-- `GET /rest/v1/promo_codes?select=*` with the public anon key returns every
-- active code together with max_uses and used_count — a competitor can scrape
-- the whole discount catalogue and watch how close each code is to exhaustion.
--
-- Verified safe before revoking: the only readers are service_role.
-- features/promo/repository.ts:fetchPromo takes an injected client and is
-- called from app/api/promo/validate/route.ts with getAdminSupabase();
-- app/admin/promos/page.tsx, features/admin/promo-actions.ts and
-- features/subscriptions/subscriptions-cron.ts also use the admin client.
-- No browser/anon client reads promo_codes anywhere in the repository.
--
-- The RLS policy "public can select active promo codes" (008:26) is left in
-- place: without the grant it is unreachable, and it remains a second line of
-- defence if the grant is ever restored.
revoke select, insert, update, delete on public.promo_codes from anon, authenticated;

-- Make the usage cap part of the same row lock as the increment. The old
-- increment function updated by code alone, so two concurrent checkouts could
-- both pass the preflight max_uses check and push used_count over the cap.
create or replace function public.increment_promo_usage(p_code text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated integer;
begin
  update public.promo_codes
     set used_count = used_count + 1,
         updated_at = now()
   where code = p_code
     and active = true
     and (max_uses = 0 or used_count < max_uses);
  get diagnostics v_updated = row_count;
  if v_updated <> 1 then
    raise exception 'PROMO_EXHAUSTED_OR_INVALID'
      using errcode = 'P0001';
  end if;
end;
$$;

revoke all on function public.increment_promo_usage(text)
  from public, anon, authenticated;
grant execute on function public.increment_promo_usage(text)
  to service_role;
