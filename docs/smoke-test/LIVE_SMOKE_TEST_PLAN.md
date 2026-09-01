# Live Smoke-Test Plan — Migrations 038–048

**Target project:** `vwjqtwxqangblapnmtbm` (live Supabase)
**Pushed:** 2026-08-31 via `supabase db push` (Exit 0; `supabase migration list` shows 038–048 populated)
**Purpose:** confirm the 11 applied migrations behave correctly on live before promoting further traffic / relying on the new objects.

> The push succeeded. The only warning (`failed to cache migrations catalog` / `pgdelta-target-ca.crt: ENOENT`) is the Supabase CLI's pg-delta catalog-cache optimization failing to write its cert file — it does **not** affect the migrations. Upgrade the CLI (`v2.109.1` → `v2.116.0+`) to silence it.

---

## 0. Prerequisites

| Need | Where / how |
|------|-------------|
| Live DB URI (postgres/service_role) | Supabase dashboard → Project Settings → Database → Connection string (URI). Use the **postgres** or **service_role** password — **not** the anon key. |
| Node 20+ with `pg` available | The managed Node workspace already has `pg` (`C:\Users\ASUS\.workbuddy-ai\binaries\node\workspace`). |
| Deployed Worker URL | Your Cloudflare `workers_dev` / preview URL (the webhook lives at `/api/webhooks/paymob`). |
| `PAYMOB_HMAC_SECRET` | Worker secret / `.env`. Same value used in production. |
| A known `pending` order | Its `display_number` and `total_minor` (for the replay test). |

**Run the automated DB checks (checks 1, 2a, 3, 4, 5 below):**

```bash
cd C:/Users/ASUS/.workbuddy-ai/binaries/node/workspace
# pg is installed here; point Node at it and supply the live URI
NODE_PATH="$PWD/node_modules" DATABASE_URL='postgresql://postgres:<pw>@<host>:6543/postgres?sslmode=require' \
  node /d/Next.js_Projects/rosette/scripts/smoke/live-db-checks.cjs
```

**Run the automated webhook replay test (check 2b):**

```bash
cd C:/Users/ASUS/.workbuddy-ai/binaries/node/workspace
NODE_PATH="$PWD/node_modules" \
  WORKER_URL='https://<your-worker>.workers.dev' \
  PAYMOB_HMAC_SECRET='***' \
  ORDER_DISPLAY_NUMBER='RO-XXXX-YYYY' \
  ORDER_TOTAL_MINOR='2500' \
  DATABASE_URL='postgresql://postgres:<pw>@<host>:6543/postgres?sslmode=require' \
  node /d/Next.js_Projects/rosette/scripts/smoke/webhook-replay-test.cjs
```

Both scripts print `PASS`/`FAIL` per check and set the exit code (0 = all pass).

---

## 1. Admin notification RPCs — `045_notification_admin_rpc.sql`

**Object:** `admin_notification_deliveries(...)` and `admin_notification_deliveries_count(...)`.
**Caller:** `features/admin/notification-admin.ts` → `listStuckDeliveries()` (invokes both RPCs with `p_q/p_status/p_type/p_now/p_max_attempts/p_stale_pending_ms`).

**Verify:**
1. Both functions exist and are granted **only** to `service_role` (revoked from anon/authenticated).
2. They execute without error and return the documented column shape.
3. `anon`/`authenticated` **cannot** execute them (permission denied).

```sql
-- (a) function + grant state
select p.proname, p.proacl
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('admin_notification_deliveries','admin_notification_deliveries_count');
-- expected: 2 rows; proacl grants execute to service_role only

-- (b) execute with the documented defaults (empty result set is fine if no stuck rows)
select * from public.admin_notification_deliveries(10, 0, null, null, null, now(), 3, 900000);
select public.admin_notification_deliveries_count(null, null, null, now(), 3, 900000);
-- expected: no error; column shape matches the function def (id,type,recipient,locale,status,attempts,last_error,created_at,order_number)

-- (c) non-privileged role is blocked
set role anon;
select public.admin_notification_deliveries_count(null);   -- expected: ERROR permission denied for function
reset role;
```

**App-level:** open the admin notifications page (the one calling `listStuckDeliveries`) on the live Worker — it should load without a 500. If there are real stuck deliveries (status `failed` with `attempts < 3`, or `pending` older than 15 min), they should appear; otherwise the list is empty.

---

## 2. Webhook replay protection — `046_webhook_events.sql`

**Object:** `webhook_events(provider, provider_reference, event_type, received_at)` with composite PK `(provider, provider_reference)`; all privileges revoked from anon/authenticated, granted to service_role only.
**Caller:** `app/api/webhooks/paymob/route.ts` → `recordWebhookEvent()` (SELECT-then-INSERT; PK collision on replay → treated as `duplicate`).

### 2a. Schema + grants (DB, automated)

```sql
select table_name from information_schema.tables where table_name = 'webhook_events';
-- expected: 1 row

select conname, pg_get_constraintdef(oid)
from pg_constraint where conname = 'webhook_events_pkey';
-- expected: PRIMARY KEY (provider, provider_reference)

select grantee, privilege_type
from information_schema.role_table_grants
where table_name = 'webhook_events' and grantee = 'service_role';
-- expected: ALL

select grantee, privilege_type
from information_schema.role_table_grants
where table_name = 'webhook_events' and grantee in ('anon','authenticated');
-- expected: 0 rows (no direct access)
```

### 2b. End-to-end replay (HTTP, automated by `webhook-replay-test.cjs`)

1. Pick a `pending` order; note its `display_number` and `total_minor`.
2. Build a Paymob callback `obj` with `merchant_order_id = display_number`, `amount_cents = total_minor`, `success = true`, a **unique** `id`, `created_at` = now ISO (within the 15-min freshness window), and the 20 HMAC fields from `features/payment/paymob-hmac.ts`.
3. Compute `hmac = HMAC-SHA512(secret, message)` using the exact field order in `paymobHmacMessage`.
4. `POST {WORKER_URL}/api/webhooks/paymob?hmac=<hex>` with body `{ "obj": <callback> }`.
5. Send the **same** payload a second time (same `id`).
6. Assert:
   - Call 1 → order flipped to `paid`, exactly **one** `payments` row for that `provider_reference`.
   - Call 2 → `200 {"received":true}` logged as `payment.webhook.duplicate`, **still exactly one** `payments` row, no second state change.

If you prefer to do it by hand, the equivalent `curl` (HMAC computed separately) is:

```bash
# compute hmac with: node -e "const c=require('crypto');const m=[amount_cents,created_at,currency,error_occured,has_parent_transaction,id,integration_id,is_3d_secure,is_auth,is_capture,is_refunded,is_standalone_payment,is_voided,order_id,owner,pending,pan,sub_type,type,success].map(v=>String(v??'')).join('');console.log(c.createHmac('sha512',process.env.S).update(m).digest('hex'))"
curl -X POST "{WORKER_URL}/api/webhooks/paymob?hmac={HMAC}" \
  -H 'content-type: application/json' \
  -d '{"obj":{"id":<unique>,"merchant_order_id":"RO-XXXX-YYYY","amount_cents":2500,"currency":"EGP","success":true,"created_at":"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'"}}'
# run it twice with the same id; the second must be a duplicate no-op
```

> The route also rejects **stale** callbacks (>15 min) and **refund** callbacks (`is_refund`/`is_refunded`/`has_parent_transaction`). Worth a third manual check: a callback with `created_at` older than 15 min is acked `received:true` without changing state.

---

## 3. RLS / grants from `038` & `040`

**`038_audit_remediation.sql`:** `promo_codes` SELECT/INSERT/UPDATE/DELETE revoked from anon/authenticated; `increment_promo_usage(text)` added (service_role only).
**`040_subscription_security_indexes.sql`:** RLS enabled on `subscription_plans`, `subscriptions`, `subscription_deliveries`, `subscription_events`; anon/authenticated denied on the three subscription tables; public may read **active** plans only.

```sql
-- (a) promo_codes no longer readable by anon/authenticated
select grantee, privilege_type
from information_schema.role_table_grants
where table_name = 'promo_codes' and grantee in ('anon','authenticated');
-- expected: 0 rows

-- (b) increment_promo_usage exists, service_role only
select p.proname, p.proacl
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'increment_promo_usage';
-- expected: 1 row; acl grants service_role only

-- (c) RLS enabled on the four subscription tables
select c.relname, c.relrowsecurity
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('subscription_plans','subscriptions','subscription_deliveries','subscription_events');
-- expected: relrowsecurity = t for all four

-- (d) anon sees nothing on the denied tables, but CAN read active plans
set role anon;
select count(*) from public.subscriptions;            -- expected: 0 (deny-all policy)
select count(*) from public.subscription_deliveries;  -- expected: 0
select count(*) from public.subscription_plans where active = true;  -- expected: >= 0 (public read allowed)
reset role;
```

---

## 4. Product → category FK — `048_product_category_fk.sql`

**Object:** `products.category_id uuid` (nullable), FK `fk_product_category` → `categories(id)` `ON DELETE SET NULL`, backfilled from `products.category` (slug) → `categories.slug`.

```sql
-- (a) column + type
select column_name, data_type, is_nullable
from information_schema.columns
where table_name = 'products' and column_name = 'category_id';
-- expected: uuid, YES (nullable by design)

-- (b) FK definition
select conname, pg_get_constraintdef(oid)
from pg_constraint where conname = 'fk_product_category';
-- expected: FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL

-- (c) backfill populated
select count(*) as total, count(category_id) as with_fk
from products;
-- expected: with_fk > 0 (backfill ran)

select count(*) as orphan_slugs
from products
where category is not null and category_id is null;
-- expected: rows whose slug no longer exists in categories (acceptable; report the count)
```

**Optional destructive-check (wrap in a transaction, then ROLLBACK — safe):**
```sql
begin;
select category_id from products where category_id is not null limit 1; -- pick one id
delete from categories where id = <that id>;
select category_id from products where id = <the product>; -- expected: NULL (ON DELETE SET NULL)
rollback;
```

---

## 5. Order total invariant + backfill — `044_order_total_invariant_and_product_id.sql`

**Object:** `chk_order_totals` CHECK constraint; `order_items.product_id` backfilled from `product_slug`.

```sql
-- (a) constraint exists
select conname, pg_get_constraintdef(oid)
from pg_constraint where conname = 'chk_order_totals';
-- expected: CHECK (total_minor = subtotal_minor + delivery_fee_minor - discount_minor - COALESCE(gift_card_minor, 0))

-- (b) backfill ran
select count(*) as items_total, count(product_id) as items_with_pid
from order_items;
-- expected: items_with_pid reflects historical rows now linked to products

-- (c) invariant holds for EVERY row
select count(*) as violating
from orders o
where o.total_minor <> (o.subtotal_minor + o.delivery_fee_minor - o.discount_minor - coalesce(o.gift_card_minor, 0));
-- expected: 0
```

> If (c) returns > 0, the migration **skipped** adding the constraint (it RAISEs a WARNING and skips rather than hard-fail on bad legacy data). Fix the offending orders, then add the constraint manually:
> ```sql
> ALTER TABLE orders ADD CONSTRAINT chk_order_totals CHECK (
>   total_minor = subtotal_minor + delivery_fee_minor - discount_minor - COALESCE(gift_card_minor, 0)
> );
> ```

---

## 6. Preview Worker end-to-end checklist

Deploy a preview Worker (or use `workers_dev`) and exercise in a browser:

- [ ] **Storefront catalog** renders; product cards display; the wishlist heart toggles (client island) without a full-page reload.
- [ ] **Admin dashboard** loads — calls `get_admin_dashboard_stats` (039) without error.
- [ ] **Admin notifications** page loads — calls the 045 RPCs without error.
- [ ] **Place a COD order** end-to-end; confirm an `orders` row + an `order_events` row exist.
- [ ] **Paymob webhook** (test mode) moves a `pending` order → `paid`; a duplicate callback is a no-op (check 2b).
- [ ] **Console is clean** — no 500s, no RLS permission errors in the Worker logs.

---

## Pass/Fail summary

| # | Check | Automated | Command / assertion |
|---|-------|-----------|---------------------|
| 1 | Admin notification RPCs (045) | ✅ `live-db-checks.cjs` | functions exist, service_role-only, execute, anon blocked |
| 2a | webhook_events schema + grants (046) | ✅ `live-db-checks.cjs` | table + PK + grants |
| 2b | Replay protection (HTTP) | ✅ `webhook-replay-test.cjs` | 2nd callback = duplicate, 1 payments row |
| 3 | RLS / grants (038, 040) | ✅ `live-db-checks.cjs` | promo_codes locked, subs denied, plans readable |
| 4 | category_id FK (048) | ✅ `live-db-checks.cjs` | column + FK + backfill |
| 5 | order total invariant (044) | ✅ `live-db-checks.cjs` | constraint + 0 violating rows |
| 6 | Preview Worker e2e | ⚠️ manual | checklist above |

Run `live-db-checks.cjs` first (it covers 1, 2a, 3, 4, 5); only 2b and 6 need a deployed Worker.
