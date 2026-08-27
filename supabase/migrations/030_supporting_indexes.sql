-- 030_supporting_indexes.sql
--
-- Targeted index additions identified during a database audit (post-028
-- privilege hardening). Postgres does NOT auto-create indexes on foreign-key
-- columns, so the FKs added in earlier migrations are still seq-scanned by
-- reverse-direction joins (e.g. cancellations listing every gift_card_holds
-- row for one order). These indexes close that gap and add two missing
-- analytical indexes for the admin UI / personalization flow.
--
-- Every CREATE INDEX uses `if not exists`, so the migration is safe to re-run
-- against a database that already has these indexes. None of the new indexes
-- change row-level visibility or write semantics, so no RLS / grant updates
-- are needed.
--
-- ── Note on a missing number ──────────────────────────────────────────────
-- The migration directory jumps from 022 → 024. Migration 023 is not present.
-- If it was an aborted experiment, leaving the gap is harmless; if it was a
-- production hot-fix that must NOT replay on a fresh database, deleting it
-- is also harmless. Do not silently fill the gap with a placeholder — that
-- would break Supabase's diff tooling and could mask the intent. Resolve
-- this in source control history before adding any future 023_* migration.

-- ── 1. Reverse-direction FK indexes ────────────────────────────────────────
-- Postgres auto-indexes the referencing side of an FK only when the migration
-- declares it explicitly. None of these did.

-- gift_card_holds.order_id is queried when an order is cancelled or refunded
-- to release unredeemed holds (cancel-actions.ts:refund flow + the gift-card
-- refund guard in 021_gift_card_refund_guard.sql).
create index if not exists gift_card_holds_order_idx
  on public.gift_card_holds(order_id);

-- gift_card_transactions.order_id is queried for order-level reconciliation
-- and refund idempotency checks (016_gift_cards.sql:refund_gift_card_redemption
-- short-circuits on `exists (select 1 ... where type = 'redeem')`).
create index if not exists gift_card_transactions_order_idx
  on public.gift_card_transactions(order_id);

-- notification_deliveries.order_id is queried by the admin notification panel
-- (notification-admin.ts:46) to enrich retry rows with the order display
-- number. The existing (status, created_at) index covers the status filter
-- but not the per-order lookup.
create index if not exists notification_deliveries_order_idx
  on public.notification_deliveries(order_id);

-- ── 2. Hot-path indexes ───────────────────────────────────────────────────

-- carts.customer_id is used by features/personalization/wishlist-sync.ts on
-- every login: it fetches all existing wishlist rows for the customer before
-- computing stale deletions. The table already has a partial unique on
-- (email) where converted_at is null and a unique on restore_token, but
-- nothing on customer_id.
create index if not exists carts_customer_idx
  on public.carts(customer_id) where customer_id is not null;

-- admin_audit_logs has only the PK index. The admin UI timeline and per-entity
-- history views filter by actor / target / time, and the existing single-row
-- insert pattern in the app code means each filter currently seq-scans the
-- whole table.
create index if not exists admin_audit_logs_actor_idx
  on public.admin_audit_logs(actor_id, created_at desc);
create index if not exists admin_audit_logs_target_idx
  on public.admin_audit_logs(target_type, target_id, created_at desc);
create index if not exists admin_audit_logs_recent_idx
  on public.admin_audit_logs(created_at desc);

-- ── 3. Future-proofing for personalization ────────────────────────────────
-- get_personalized_picks (029_personalization.sql) joins every active product
-- against aggregated occasion signals and filters via `any(ps.occasions)`.
-- A GIN index on products.occasions lets Postgres skip the per-product unnest
-- at scale (current catalog is 16 products — this is cheap insurance before
-- the catalog grows, not a hot fix today).
create index if not exists products_occasions_gin_idx
  on public.products using gin (occasions);
