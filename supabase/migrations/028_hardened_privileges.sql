-- 028_hardened_privileges.sql
--
-- Closes the database perimeter identified in the security audit. The app
-- performs every write and every RPC call through the service_role client
-- (bypasses RLS by design); the anon/authenticated Data API is used only for
-- storefront reads and a single self-service write (profiles). So tightening
-- the Data API to that minimal surface breaks nothing while removing:
--   * full CRUD on the three tables that shipped WITHOUT row level security,
--   * direct execution of every security-definer RPC by the public anon key.
--
-- Safe to run against a live database: every statement is idempotent
-- (drop-if-exists policies, plain grant/revoke) and order-safe (revokes run
-- before the compensating grants).

-- ── 1. Row level security on the three tables that had NONE ───────────────
-- inventory_reservations, admin_audit_logs and notification_deliveries were
-- created in 001_commerce.sql without `enable row level security`. Combined
-- with 020_api_privileges.sql's blanket `select,insert,update,delete ... to
-- anon, authenticated`, that let ANY holder of the public anon key read the
-- admin audit trail, the notification queue (recipient emails/phones) and
-- inventory holds — and forge or erase them — straight through the Data API.
-- Enable RLS and add an explicit deny-all so only service_role (which bypasses
-- RLS) can touch them.
alter table public.inventory_reservations enable row level security;
alter table public.admin_audit_logs        enable row level security;
alter table public.notification_deliveries enable row level security;

drop policy if exists "deny all" on public.inventory_reservations;
create policy "deny all" on public.inventory_reservations
  for all to anon, authenticated
  using (false) with check (false);

drop policy if exists "deny all" on public.admin_audit_logs;
create policy "deny all" on public.admin_audit_logs
  for all to anon, authenticated
  using (false) with check (false);

drop policy if exists "deny all" on public.notification_deliveries;
create policy "deny all" on public.notification_deliveries
  for all to anon, authenticated
  using (false) with check (false);

-- ── 2. Replace the global CRUD grant from 020 with least privilege ────────
-- 020 granted select,insert,update,delete on every table (and on every
-- future table) to anon, authenticated and service_role. RLS is the real
-- gate, but the grant is still the first check — remove every Data API
-- privilege and re-grant only the read surface the storefront actually uses.
-- The single surviving write (a customer updating their own profile) is
-- re-granted below and is already scoped by the "users can update own
-- profile" RLS policy (auth.uid() = id) and the prevent_role_escalation
-- trigger. service_role keeps its 020 grant (it bypasses RLS by design).
revoke select, insert, update, delete, truncate on all tables in schema public
  from anon, authenticated;

-- Public catalog: readable by anyone (RLS policy `active = true` or
-- `using (true)` on product_variants/inventory). Granted to both anon
-- (storefront without a session) and authenticated (signed-in storefront).
grant select on
  public.products,
  public.categories,
  public.cities,
  public.delivery_rules,
  public.product_variants,
  public.inventory,
  public.blog_posts,
  public.authors,
  public.promo_codes,
  public.product_reviews
  to anon, authenticated;

-- Authenticated own-row reads (RLS `customer_id = auth.uid()` / `id = auth.uid()`).
-- Also includes the two embed targets (order_items, order_events) so
-- `orders.select('*,order_items(*),order_events(*)')` does not 403 — RLS
-- still returns zero rows when no policy matches (order_events is currently
-- deny-by-default, which preserves the existing empty-timeline behaviour).
grant select on
  public.profiles,
  public.orders,
  public.order_items,
  public.order_events,
  public.order_cancel_requests,
  public.order_change_requests,
  public.wishlist_items
  to authenticated;

-- Single surviving Data API write: customers may update their own profile.
grant update on public.profiles to authenticated;

-- ── 4. Function EXECUTE: service_role only ────────────────────────────────
-- Postgres grants EXECUTE to PUBLIC by default and no migration ever revoked
-- it, so every security-definer RPC was invocable by name with the public
-- anon key — create_pending_order (bypasses price recompute + Paymob),
-- reserve_gift_card / redeem_gift_card_hold / release_gift_card_hold /
-- refund_gift_card_redemption (gift-card money), upsert_cart,
-- apply_change_to_order, reserve_order_inventory, increment_promo_usage.
-- Revoking from PUBLIC also strips the implicit grant that service_role
-- currently relies on, so the explicit service_role grant below is mandatory.
-- All app RPC calls go through the service_role client, so they keep working;
-- function-to-function calls inside security-definer bodies run as the owner
-- and are unaffected.
revoke execute on all functions in schema public
  from public, anon, authenticated;
grant execute on all functions in schema public to service_role;
alter default privileges in schema public grant execute on functions to service_role;

-- ── 5. Future objects default to the safe surface ─────────────────────────
-- 020 granted select,insert,update,delete on FUTURE tables to anon and
-- authenticated. Strip everything so new tables are inaccessible by default
-- and must be explicitly exposed — never silently world-readable.
alter default privileges in schema public
  revoke select, insert, update, delete on tables from anon, authenticated;
-- Future functions must not be world-executable by default; service_role
-- keeps working via the explicit default grant in step 4.
alter default privileges in schema public
  revoke execute on functions from public, anon, authenticated;
