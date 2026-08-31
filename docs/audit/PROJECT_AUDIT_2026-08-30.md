# Rosette — Comprehensive Project Audit

**Date:** 30 August 2026
**Scope:** Full application audit — `app/` (57 pages, 57 API routes), `components/` (90 files), `features/` (31 domain modules), `lib/`, `hooks/`, `supabase/migrations/` (36 migrations), `tests/` (236 files / 1,256 tests)
**Stack:** Next.js 16.3.1 (App Router) · React 19.1 · TypeScript 5.9 · Tailwind v4 · Supabase (Postgres/Auth/Storage) · Paymob · Groq · Resend/Nodemailer · Cloudflare Workers via OpenNext
**Method:** Static analysis of ~465 source files plus 2,845 lines of SQL. Six parallel domain audits (database, performance, security, architecture/code quality, UI/UX) followed by independent verification of every Critical finding against source.

---

## Executive summary

Rosette is a **materially above-average codebase**. It does several hard things correctly that most commerce apps get wrong: money is integer minor units end-to-end with zero floats in the schema, the Paymob webhook is genuinely production-grade (HMAC with `timingSafeEqual`, amount revalidation, refund-callback discrimination, idempotency keys), migration `028` is a well-reasoned privilege-hardening pass, `tsc --noEmit` is clean at **0 errors with 0 `@ts-ignore`**, and the checkout accessibility work clears a higher bar than most production storefronts.

**But the audit found 5 defects that break shipped functionality today**, not hypothetical future risks. Three of them are silent — they produce no error, no log line, and no visible symptom until data or traffic grows.

### The five things that are broken right now

| # | Defect | Evidence | Why it's silent |
|---|---|---|---|
| 1 | **Subscription checkout fails 100% of the time** | `features/subscriptions/service.ts:22` selects `slug` and `price_minor` from `product_variants`; neither column exists (`001_commerce.sql:36-43` defines `price_delta_minor`) | PostgREST returns `42703`, thrown as `PRODUCT_VARIANT_NOT_FOUND`, caught upstream as generic `'unavailable'` |
| 2 | **Inventory leaks permanently on every abandoned order** | `001_commerce.sql:208` writes a 30-min reservation; **no code anywhere deletes it** (verified: zero references outside that migration) | `reserved_quantity` creeps up invisibly; admin shows `quantity - reserved_quantity`, so it looks like real low stock |
| 3 | **Homepage is entirely untranslated** | `app/[locale]/[city]/(home)/page.tsx:29-41` — hardcoded `'EGP 1,250'`, `'The White Edit'`, `'For Love'` | Page renders fine; Arabic/French visitors just read English with `dir="rtl"` applied |
| 4 | **Checkout inputs have no visible focus indicator** | `features/checkout/CheckoutForm.tsx:40` — `focus-visible:ring-0 focus-visible:ring-offset-0` | Keyboard users cannot tell which field they're in during the highest-value flow in the app |
| 5 | **`text-sage` fails WCAG AA at 3.37:1** | `globals.css:88,183` → `#6f8f6d` on `#fdf6f0`; 25 of 31 usages never migrated to the `sage-ink` fix | Contrast failures are invisible to sighted developers on good monitors |

### Defects 1, 2 and 5 share a root cause

None of them throw an error. There is **no test that asserts a selected column set matches the schema**, **no test that exercises the subscription checkout path**, **no test asserting contrast ratios**, and **no test that covers RLS policies** (38 `enable row level security` statements, 33 policies, 0 tests). The test suite is behaviour-focused and fast (1,256 tests in 15s) with **zero snapshots** — genuinely good — but it tests *logic the developers wrote*, not *contracts the system depends on*.

### Scorecard

| Category | Rating | Critical | High | Medium | Low |
|---|---|---|---|---|---|
| Database schema & queries | ⚠️ **At Risk** | 3 | 6 | 12 | 6 |
| Application performance & scalability | ⚠️ **At Risk** | 4 | 6 | 4 | 2 |
| Security | ✅ **Reasonable** | 0 | 2 | 8 | 6 |
| Code quality & maintainability | ✅ **Good** | 0 | 6 | 7 | 6 |
| Architecture & design patterns | ⚠️ **Needs Work** | 0 | 3 | 4 | 2 |
| UI/UX consistency & usability | ⚠️ **At Risk** | 2 | 9 | 15 | 8 |

**Security is the strongest area** — no Critical findings, and the team has clearly thought about the Supabase-specific footguns (`getUser()` not `getSession()`, EXECUTE revoked from PUBLIC, role-escalation trigger). The residual risk is concentrated in **content rendering (XSS)** and the **absence of any `middleware.ts`**.

---

# 1. Database schema & query performance

**Rating: At Risk.** The schema fundamentals are excellent — integer minor units everywhere, `timestamptz` for instants, uniform UUID PKs, no floats. The problems are in **referential integrity gaps, missing indexes on growing tables, and concurrency correctness in PL/pgSQL**.

## 1.1 — CRITICAL — Inventory reservations are created and never released

**Location:** `supabase/migrations/001_commerce.sql:108-117` (table), `:208-210` (insert), `:189-222` (`reserve_order_inventory`)

```sql
-- :208-210
insert into public.inventory_reservations(order_id, variant_id, quantity, expires_at)
values (p_order_id, (item->>'variant_id')::uuid, (item->>'quantity')::integer,
        now() + interval '30 minutes');
```

The reservation and the matching `inventory.reserved_quantity += qty` are only undone by the `exception when others` handler **inside the same function invocation** (`:214-221`). Verified by grep: the **only** references to `inventory_reservations` in the entire repository are inside `001_commerce.sql`. No cron, no function, no admin query, no application code touches this table.

**Impact:** Every order that reaches `create_pending_order` but never completes payment — the common case, since Paymob redirect abandonment is routine — permanently decrements sellable stock. With `check (reserved_quantity <= quantity)` at `:68`, once `reserved_quantity` reaches `quantity`, **every subsequent order for that variant fails `INSUFFICIENT_STOCK` even though the warehouse is full**. It's invisible in the admin UI, which reports `quantity - reserved_quantity` and therefore looks like genuine low stock. The promo side effect is also poisoned: `create_pending_order` calls `increment_promo_usage`, and there is no decrement path.

**Fix:** New migration adding `release_expired_reservations(batch)` (SQL in Appendix A of the DB audit), plus a cron route mirroring `app/api/cron/subscriptions/route.ts`, plus an index on `(expires_at)`. Also make the insert idempotent — the `unique(order_id, variant_id)` at `:116` already exists:
```sql
insert into public.inventory_reservations(order_id, variant_id, quantity, expires_at)
values (...) on conflict (order_id, variant_id) do nothing;
```

## 1.2 — CRITICAL — `product_variants.slug` / `.price_minor` don't exist but are selected

**Location:** `features/subscriptions/service.ts:22` vs `supabase/migrations/001_commerce.sql:36-43`

```ts
// features/subscriptions/service.ts:22 — VERIFIED
const { data, error } = await client.from('product_variants')
  .select('id,slug,name_en,name_ar,name_fr,price_minor')
  .eq('product_id', productId).eq('active', true).order('price_minor', {ascending:true}).limit(1).maybeSingle();
if (error || !data) throw new Error('PRODUCT_VARIANT_NOT_FOUND');
```

Schema (verified) has `id, product_id, name_en, name_ar, price_delta_minor, active` — plus `name_fr` from `003`. **There is no `slug` column and no `price_minor` column.** `.order('price_minor')` returns `42703 undefined column`, so `error` is truthy and the function throws.

**Impact:** `resolveProductVariant` is called unconditionally from `createSubscription` before the `create_subscription_order` RPC. **Subscription checkout fails 100% of the time.** It surfaces to the user as generic `'unavailable'`. Even with the columns present, `priceMinor` would be semantically wrong — variants store a *delta* (`price_delta_minor`), which must be summed with the plan price, not substituted for it.

**Fix:** select `price_delta_minor`, resolve the slug from `products` (which has it), and treat the variant as a price *delta*. Add a regression test asserting selected columns match `information_schema.columns`.

## 1.3 — CRITICAL — `materialize_subscription_delivery` TOCTOU → duplicate orders, double stock reservation

**Location:** `supabase/migrations/037_subscriptions.sql:324-368`

```sql
-- :324 — VERIFIED: no FOR UPDATE
select d.id, d.position, d.status as dstatus into v_delivery
  from public.subscription_deliveries d
 where d.id = p_delivery_id and d.subscription_id = p_subscription_id;
if v_delivery.dstatus <> 'scheduled' then return jsonb_build_object('status','already_ordered'); end if;
-- ... inserts order (:342-352, total_minor = 0), order_item (:354), reserves inventory (:364) ...
-- :367 — VERIFIED: no GET DIAGNOSTICS, result discarded
update public.subscription_deliveries set status='ordered', order_id=v_order_id, updated_at=now()
 where id = p_delivery_id and status = 'scheduled';
```

Two concurrent invocations (retried cron, admin "materialize now" alongside the cron, two overlapping cron ticks) both pass the guard, both insert an order, both reserve stock. The second `update … where status='scheduled'` matches 0 rows and is **silently ignored**.

**Impact:** Duplicate physical flower deliveries billed at **zero** — the function hardcodes `0, 0` at `:349` because money was booked at bundle purchase — so duplication is invisible in revenue reporting and surfaces only as a customer complaint plus a doubled inventory decrement.

**Fix:** `select … for update` on both the delivery and subscription rows, verify with `if not found then raise … using errcode='40001'` (retryable), and retry on `40001` in `features/subscriptions/subscriptions-cron.ts:34`.

## 1.4 — HIGH — `order_items.order_id` has no index

**Location:** `001_commerce.sql:96` (FK); the index block at `:167-170` covers `order_events` but **not** `order_items`

Every order-detail embed seq-scans: `features/account/account-repository.ts:76` (`select('*,order_items(*),order_events(*)')`), `features/order/supabase-repository.ts` (`getPublicOrder`), `features/tracking/lookup-order.ts:42`, `features/reviews/reviews-service.ts:30-34`. PostgREST issues the embed as a separate query, so it's paid on **every page view**. The `on delete cascade` from `orders` also seq-scans to find children.

**Fix:** `create index on public.order_items (order_id);` plus partial indexes on `variant_id` and `delivery_group_id`.

## 1.5 — HIGH — No indexes on `orders.payment_status`, `fulfillment_status`, `customer_email`, `recipient_phone`, `delivery_date`

The admin orders list (`app/admin/orders/page.tsx:29-30`) filters by status and sorts `created_at desc limit 100` — full scan + sort, then discard, **on every keystroke of the search box**. Order tracking filters `customer_email` (unindexed, and case-sensitive so `Sara@X.com` ≠ `sara@x.com`). The occasions cron runs a `delivery_date` range scan **once per occasion row**.

**Fix:**
```sql
create index on public.orders (payment_status, created_at desc);
create index on public.orders (fulfillment_status, created_at desc);
create index on public.orders (customer_email);
create index on public.orders (recipient_phone);
create index on public.orders (customer_id, delivery_date) where payment_status = 'paid';  -- equality first, range last
```

## 1.6 — HIGH — `upsert_cart` is a SELECT-then-INSERT race, and its own comment claims `ON CONFLICT`

**Location:** `supabase/migrations/026_upsert_cart_rpc.sql:1-12` (comment) vs `:45-72` (body)

The header comment says *"uses INSERT ... ON CONFLICT to atomically choose between insert and update."* The body does `select id into v_existing_id … limit 1` (no `FOR UPDATE`, no `limit 1 … order by`) followed by a plain insert. **The bug the migration was written to fix is still present, just moved from JS into PL/pgSQL.** Two concurrent calls both find null and both insert; the second violates `carts_email_active_idx` (`013:18`), raising `23505` inside a `security definer` function → 500 → the customer's saved bag is lost.

**Fix:** Make the body match the comment — `on conflict (email) where converted_at is null do update set …`. For the guest (`customer_id IS NULL`) case, use `pg_advisory_xact_lock` (transaction-pooling safe).

## 1.7 — HIGH — `promo_codes` exposes every active code plus `max_uses` / `used_count` to the anon key

**Location:** `008_promos.sql:26` policy + `028_hardened_privileges.sql:67` grant

`GET /rest/v1/promo_codes?select=*` with the public anon key returns `code`, `type`, `percent_off`, `value_minor`, `minimum_order_minor`, `starts_at`, `expires_at`, `max_uses`, `used_count` for every active row. Anyone can scrape the entire live discount catalogue in one unauthenticated request and watch `used_count` to see how much headroom remains. **No application path uses this grant** — `features/promo/repository.ts` runs through `service_role`.

**Fix:** `revoke select on public.promo_codes from anon, authenticated;`. If a client-side preview is needed, expose a narrow `security definer` function returning only the non-sensitive fields.

## 1.8 — HIGH — `037_subscriptions.sql` creates four tables with **zero** indexes

`subscription_plans`, `subscriptions`, `subscription_deliveries`, `subscription_events` have only PK (`unique(subscription_id, position)` on deliveries). Grepping `037` for `create index` returns nothing — contradicting the lesson `030_supporting_indexes.sql:4-8` wrote down six migrations earlier. The cron then does per-subscription `subscription_deliveries` lookups filtering `status` and `scheduled_date`, both unindexed.

## 1.9 — HIGH — Cron jobs: unbounded reads, per-row round trips, no batching

| Cron | Outer read | Per-row work | Bounded? |
|---|---|---|---|
| subscriptions | `subscriptions.in('status',['active'])` — **no limit** | 2 queries + N RPCs per sub, 3 full passes | ✘ |
| occasions | `occasions` — **no limit**, `active` filtered in **JS** (defeating `occasions_active_idx`) | 1 insert + 1 preference query + 1 range scan | ✘ |
| abandoned-carts | `carts` — **no limit** | 1 preference query + 1 email + 1 update | ✘ |
| notifications | `notification_deliveries.in('status',['failed','pending'])` — **no limit** | 1 order select + 1 send + 1 update | ✘ |
| wishlist | `.limit(500)` ✔ | 1 preference query + up to 2 updates | ✔ |

Every one uses `for (const row of rows) { await ... }` — strictly sequential. At 500 subscriptions × ~3 round trips × 20-80 ms, the subscriptions cron needs **1,500 subrequests** — far beyond one Cloudflare Worker invocation. It gets killed mid-pass, and because `materialize_subscription_delivery` has the §1.3 race, a killed-and-retried pass can double-materialize.

**Also found:** promo generation is not collision-safe (`subscriptions-cron.ts:53`) — `Math.random().toString(36).slice(2,8)` can return **fewer than 6 characters**, and on `23505` the code silently skips the customer's renewal discount with no retry and no log.

## 1.10 — MEDIUM — Seven tables have owner-scoped RLS policies but no `GRANT` — the policies are dead code

`recipients`, `occasions`, `occasion_reminders`, `user_preferences`, `order_delivery_groups`, `address_book` and (per `028:110-111`) anything added after it. Postgres checks the grant **before** RLS, so the Data API returns `42501` and the policy is never evaluated.

**This is fail-closed, so it is not a security hole.** But the policies are **misleading**: a reviewer reads `customers read own recipients using (customer_id = auth.uid())` and believes row-level ownership is enforced by the database. It is not — ownership is enforced entirely by application code threading `customer.id` into `.eq()`. That works today, but **every future query against these tables is one forgotten `.eq()` away from a cross-tenant leak with no database backstop**.

**Fix (pick one):** (A) grant + switch those actions to the user-scoped client so RLS becomes the real backstop, or (B) delete the inert policies and replace with explicit `using (false) with check (false)` deny-all so the schema stops lying.

## 1.11 — MEDIUM — The four subscription tables have no RLS at all

`037_subscriptions.sql` never calls `enable row level security` on tables holding `customer_id`, `recipient_name`, `recipient_phone`, `delivery_address`, `gift_message`. Currently contained only because `028`'s default-privilege revocation means no grants exist — **one privilege grant away from nothing**. This is exactly the failure mode `028` was written to fix for `inventory_reservations` / `admin_audit_logs` / `notification_deliveries`, reintroduced.

## 1.12 — MEDIUM — `apply_change_to_order` recomputes only 2 of 4 money columns

`applyChanges()` recomputes `subtotal_minor` and `total_minor` but leaves `delivery_fee_minor`, `discount_minor` and `gift_card_minor` at their original values. A change request that adds a recipient group or changes city does not recompute the fee or re-validate the promo minimum. The stored `total_minor` then disagrees with `subtotal + fee − discount − gift_card`, and the dashboard's revenue sum silently drifts from the payments ledger.

**Fix:** recompute in the RPC, and add `check (total_minor = greatest(0, subtotal_minor + delivery_fee_minor - discount_minor - coalesce(gift_card_minor,0)))` **not valid**, backfill, then validate.

## 1.13 — MEDIUM — Catalog reads the whole product table **and every review**, then filters/sorts/paginates in JS

`features/catalog/supabase-repository.ts:16-37`: two sequential unbounded queries (all active products with nested variants+inventory, then **every approved review in the database**), aggregated and paginated in JS. `getBySlug` calls `readProducts()` — a single-product PDP downloads the entire catalog.

Two consequences beyond performance: the GIN indexes on `occasions` / `gift_recipients` / `gift_styles` / `gift_colors` are **unusable** because filtering is in JS; and `max_rows = 1000` means **ratings silently become wrong** past 1,000 reviews.

## 1.14 — MEDIUM — `supabase/config.toml:18` `max_rows = 1000` is a silent correctness cliff

PostgREST truncates at 1,000 rows **without an error** (HTTP 200). Combined with the unbounded queries above, the admin dashboard, notification retry cron, notification admin panel, `listCustomerOrders`, `listAdminSubscriptions` and catalog ratings **all silently return wrong numbers** once their table exceeds 1,000 matching rows. Invisible in logs.

## 1.15 — Other findings

| Sev | Finding | Location |
|---|---|---|
| M | `increment_promo_usage` is `security definer` **without** `set search_path` — every other SD function sets it. Latent (blocked by `028:101`); one `grant execute` from being live | `008_promos.sql:20` |
| M | `get_personalized_picks` declared volatile → PostgREST won't serve it over GET → uncacheable | `029:41` |
| M | `activate_subscription` / pause / resume / cancel take no row locks → duplicate delivery schedules on webhook retry + cron | `037` |
| M | `orders.customer_id` FK has no `ON DELETE` → **account deletion fails for any customer with order history** (GDPR risk) | `001:75` |
| M | `order_items.delivery_group_id` FK without `ON DELETE`; `order_cancel_requests.delivery_group_id` has no cascade from `orders` → **deleting an order raises 23503 and rolls back the whole delete** | `033:32,36` |
| M | `inventory_reservations` has **no FKs at all** → orphaned rows unreachable by any cleanup job | `001:108-117` |
| M | `listCustomerOrders`, admin subscriptions, admin inventory have no `.limit()` | see §1.14 |
| M | Wishlist sync: sequential loop, up to 100 round trips **per login** | `features/personalization/wishlist-sync.ts:84-118` |
| L | No `updated_at` triggers anywhere — 14 tables rely on every write path remembering; `admin/inventory` sorts by it | schema-wide |
| L | `select('*')` over-fetching; `order_events(*)` embed **always returns `[]`** (deny-by-default RLS) — wasted round trip | `account-repository.ts:75` |
| L | `upsert_cart` / `035` header comments reference wrong filenames and claim behaviours the code doesn't have | `026:1-12`, `035:1` |
| L | `webhook_quarantine` deny policy lacks `WITH CHECK` (latent write-amplification) | `025:23` |

### What's done well (database)

- **Money representation is textbook-correct.** Integer minor units everywhere, `check (>= 0)` on every monetary column, integer arithmetic in TS, division by 100 only at the display boundary. **Zero floats in the schema.**
- **`028_hardened_privileges.sql` is a well-executed hardening migration** — correctly identifies the three RLS-less tables, correctly notes Postgres grants EXECUTE to PUBLIC by default, revokes before re-granting, and locks down future objects via default privileges.
- **Gift-card RPCs use `SELECT … FOR UPDATE` correctly** (`016:161,168`) — the one place with proper pessimistic locking, and it's on the money path.
- **Idempotency keys are correctly modelled** — `payments.idempotency_key` unique, `carts_email_active_idx` partial unique, `occasion_reminders(occasion_id, cycle_year)` used as a claim mechanism, `gift_card_holds` partial unique.
- **No Supavisor-incompatible features** — no advisory locks, no LISTEN/NOTIFY, no temp tables, no session-level SET, no prepared statements, no cursors.
- `prevent_role_escalation()` correctly blocks privilege escalation on `profiles`, the one table accepting a Data API write.

---

# 2. Application performance & scalability

**Rating: At Risk.** The app currently works because the catalog is ~16 products and traffic is low. Almost every finding is a **scale cliff** rather than a present-day symptom — except the render-strategy issue, which costs real latency on every request today.

## 2.1 — CRITICAL — `await cookies()` in the root layout makes all 57 routes dynamic

**Location:** `app/layout.tsx:59-63` — **verified**

```tsx
export default async function RootLayout({ children }) {
  const store = await cookies();
  const locale = await resolveServerLocale();        // awaits cookies() a second time
  const attrs = resolveHtmlAttributes(locale, store.get('rosette.theme')?.value);
  const reduceMotionInitial = store.get('rosette-reduce-motion')?.value === '1';
```

Any dynamic API in a layout opts **every descendant route** out of static rendering and ISR. Combined with **zero `generateStaticParams`** (grep: 0 hits), there is no prerender path at all.

**Impact:** 3 locales × 12 cities × ~19 route shapes ≈ **680 route permutations**, every one rendered on demand at the edge, each paying 2–6 sequential Postgres round-trips. The home page is the clearest waste: it performs **zero DB reads** (all hardcoded constants) yet is fully dynamic — so its `loading.tsx` can never render.

**Fix:** Move the two cookie reads out of the layout. Render `<html lang>`/`<dir>` from the `[locale]` segment and let the existing `THEME_SYNC_SCRIPT` / `LOCALE_SYNC_SCRIPT` inline scripts handle the non-prefixed `/admin`, `/login` cases — they already do exactly this job client-side.

## 2.2 — CRITICAL — No cache invalidation exists for catalog, inventory, or prices

`revalidateTag` → **0 hits**. `unstable_cache` → **0**. `use cache` → **0**. The only invalidation is `revalidatePath` in 6 places, all account-scoped.

There is currently nothing to invalidate (§2.1 makes everything dynamic), but this is a **hard blocker** for the §2.1 fix: the moment you add `revalidate`, you serve stale prices, stale inventory and stale `active` flags with no mechanism to bust them. `features/admin/catalog-actions.ts` calls **no** revalidation at all.

**Fix:** Adopt tag-based invalidation *before* enabling any caching.

## 2.3 — CRITICAL — Admin gift-cards page fires N+1 concurrent queries that exceed the Workers subrequest cap

**Location:** `app/admin/gift-cards/page.tsx:20-21`

```tsx
const cardsWithHistory = await Promise.all(cards.map(async (card) => ({
  card, transactions: await listGiftCardTransactions(client, admin, card.id),
})));
```

`listGiftCards` has **no `.limit()`**. Cloudflare Workers cap concurrent subrequests at **50 (free) / 1000 (paid)**. This page **hard-fails above ~50 gift cards on the free plan**, and it fails concurrently with no graceful degradation.

**Fix:** Replace with one `.in('gift_card_id', ids)` query grouped in memory; add `.limit()`.

## 2.4 — CRITICAL — Admin dashboard loads four unbounded tables into the isolate

**Location:** `app/admin/page.tsx:23-28` — four parallel `select`s with **no filter and no limit**, then `features/admin/dashboard-stats.ts:33-48` makes **7 full passes** over the orders array with `new Date()` allocated per order per pass. At 10,000 orders: ~10k rows transferred, ~90k JS iterations, ~30k `Date` allocations, and `getAdminSupabase()` called **4×**. Also silently wrong past 1,000 rows (§1.14).

**Fix:** A single `admin_dashboard_stats()` SQL aggregate using `count(*) filter (...)` and `sum(...) filter (...)`.

## 2.5 — HIGH — `@supabase/supabase-js` is in the initial bundle of every page

**Location:** `features/wishlist/WishlistProvider.tsx:5` and `components/layout/AccountNavItem.tsx:5`, both mounted in `app/layout.tsx:64`

≈**40–50 KB gzipped** in the first-party JS of every route — including home, blog, about, privacy — pages that never touch Supabase. Both call sites only need it inside an effect/handler.

**Fix:** Dynamic `import()` at point of use; gate `WishlistProvider` behind a signed-in check so anonymous visitors never download it.

## 2.6 — HIGH — The lazy chat widget exists but was never wired up

`components/support/ChatWidgetLazy.tsx` is **dead code** (grep: 1 hit, its own definition). `app/layout.tsx:12` imports the eager `ChatWidget` instead. **One-line fix** that removes the widget from every route's bundle.

## 2.7 — HIGH — The two `<Suspense>` boundaries are no-ops

**Location:** `app/[locale]/[city]/shop/(list)/page.tsx:47-62`, `shop/[slug]/page.tsx:52-67`

Data is awaited in the page body, then passed as **already-resolved props** to `'use client'` components that are **not async**. A Suspense boundary only streams when its child suspends — these never suspend, so the skeleton can never appear and `get_personalized_picks` stays on the critical path for every signed-in user.

**Fix:** Extract an async server component that owns the `await`, and let Suspense wrap that.

## 2.8 — HIGH — Sequential await chains on the two highest-traffic pages

`shop/[slug]/page.tsx:41-57` — 6 sequential awaits, 5 network round trips (~200ms TTFB vs parallelized). `getApprovedReviews` itself does two sequential queries. Same pattern on the shop list page and the account orders page.

**Fix:** `Promise.all` the independent awaits (`getServerT` needs no DB; `createClient()` + `getUser()` can run concurrently with the catalog read).

## 2.9 — HIGH — `React.cache` used in only 3 of ~30 data functions

Only `getProduct`, `getPost`, `getAuthor` are wrapped. `getServerSupabase()` is called by 5 different functions per PDP render — 5 `cookies()` reads and 5 client constructions. No `unstable_cache` / `use cache` anywhere.

## 2.10 — HIGH — `sitemap.ts` scans the entire catalog on every request

`app/sitemap.ts:9-18` — three sequential unbounded reads; `list({})` routes through `readProducts()` (§1.13) so it pulls **all products + all reviews** just to get slugs. Output is `36 × (4 + N + M + K)` URLs: ~800 today, **~18,200 at 500 products**. Dynamic, no `revalidate`, every crawler hit re-runs the full scan. A cheap DoS vector on a public endpoint.

**Fix:** `.select('slug')` only; `export const revalidate = 3600`; split into a sitemap index above ~5k URLs.

## 2.11 — HIGH — Worker size risk, and the size check uses the wrong threshold

**Location:** `scripts/check-worker-size.mjs:9` — `const LIMIT_BYTES = 3 * 1024 * 1024;`

Cloudflare's documented compressed limit is **1 MiB on Free, 10 MiB on Paid**. A 3 MiB threshold is correct for neither: it **passes a worker that Cloudflare Free rejects**, and is needlessly tight for Paid.

Server deps pulled into the Worker: `groq-sdk` (1.9 MB), `@supabase/supabase-js` (711 KB), `nodemailer` (675 KB), `fuse.js` (445 KB). `open-next.config.ts` is `defineCloudflareConfig({})` — no route splitting. `nodemailer` is the worst offender (pulls `aws-sdk`, `form-data`, `iconv-lite` shims) and **Resend is already integrated** as an alternative.

**Fix:** Switch `EMAIL_DELIVERY_MODE` to Resend (`wrangler.jsonc:10` currently sets `"disabled"`); lazy-import `groq-sdk`; correct the threshold.

## 2.12 — HIGH — The Fuse cache is module-level state: stale, unbounded, and never hits

**Location:** `features/catalog/fuse-search.ts:31-39`

The guard is **reference equality** (`cachedProductsRef === products`), but `readProducts()` builds a fresh array each call — so the cache misses on essentially every request and **the index is rebuilt per request**, while any hit returns a Fuse built from a stale array. No TTL, no invalidation, no eviction. The file's own comment says it stays "fast for 100-500 items"; beyond that, index construction is 100–300 ms of **billed, capped** Workers CPU.

**Fix:** Move search to Postgres (`pg_trgm` / `tsvector`) — removes Fuse, the module cache, and the whole-catalog read in one change.

## 2.13 — Medium / Low

| Sev | Finding | Location |
|---|---|---|
| M | No KV / R2 / Durable Objects / Cache API anywhere — 100% of reads hit Postgres | `wrangler.jsonc` |
| M | Fake pagination: `listStuckDeliveries` fetches the whole table then slices in JS | `notification-admin.ts:41,68-71` |
| M | 31 of 33 storefront pages have no `loading.tsx` / Suspense → no early shell flush; PDP TTFB ≈ full fetch latency | see §2.7 |
| L | `ProductVisual` defaults `sizes='100vw'` and `priority=false`; on the PDP the image is ~58vw → ~1.7× oversized LCP image, lazy-loaded | `ProductVisual.tsx:6` |
| L | `runInBackground` silently `await`s the work if `getCloudflareContext()` throws → +300-800ms on `POST /api/orders` | `lib/wait-until.ts:9-16` |

### What's done well (performance)

- **Server-only SDKs are perfectly isolated.** `groq-sdk`, `nodemailer`, `resend` and the service-role Supabase client each have exactly one import site, all server-only. **Zero leakage into client bundles** — verified by grep.
- **Barrel-import discipline.** All 21 `lucide-react` imports are named; zero `import * as Icons`. Radix per-primitive. Tree-shaking is effective.
- **`next/image` and `next/font` used correctly** — 9 files, sizes/priority on hero images, `fill` inside aspect-ratio containers, `display: 'swap'` on all four families, no render-blocking font requests.
- **Motion is centralized and reduced-motion-aware** — one `MotionConfig` with `reducedMotion` wired to a cookie-seeded preference; variants are transform/opacity only.
- **CLS fundamentals solid** — reserved image space everywhere, sticky header with reserved height, inline theme script + `suppressHydrationWarning`.
- **Async `params`/`searchParams` awaited correctly in all 57 pages** — no Next.js 15/16 migration defects.
- **Rate limiting is architecturally sound** — Upstash Redis primary with a documented, bounded, pruned in-isolate Map fallback.
- **Inventory reservation is race-safe** — `reserve_order_inventory` uses a single-statement compare-and-swap with `row_count` check and rollback.

---

# 3. Security vulnerabilities & best practices

**Rating: Reasonable — the strongest category. 0 Critical, 2 High, 8 Medium, 6 Low.** The team has clearly thought about Supabase-specific footguns. Residual risk is concentrated in **content rendering (XSS)** and **the absence of any `middleware.ts`**.

## 3.1 — HIGH — Stored XSS in blog/delivery pages; an **operator** can author it → admin takeover

**Location:** `app/[locale]/[city]/blog/[slug]/page.tsx:45`, `app/[locale]/[city]/delivery/page.tsx:37`

```tsx
<div ... dangerouslySetInnerHTML={{ __html: content }} />
```

`post.contentEn` is raw HTML from the database with **zero sanitization** on write or read. The writer is `app/api/admin/blog/route.ts:14`, which calls `getCurrentAdmin()` — and `features/auth/server.ts:10` accepts role `admin` **or** `operator`. But `features/admin/authorization.ts:9` shows `operator` is *meant* to be restricted to fulfillment transitions only. The blog endpoint applies **no role check at all**.

**Impact:** A low-trust `operator` creates a blog post containing `<img src=x onerror=...>`. CSP `script-src 'self' 'unsafe-inline'` permits inline handlers; `connect-src` blocks exfiltration to arbitrary hosts but **not** to `https://*.supabase.co`. More directly: an admin visiting that page has their session stolen → **operator escalates to full admin**.

**Fix:** Sanitize through a strict allowlist at render time (or render Markdown instead of raw HTML), **and** enforce `role === 'admin'` on all content/admin endpoints.

## 3.2 — HIGH — Stored XSS via JSON-LD `reviewBody`

**Location:** `components/seo/ProductJsonLd.tsx:5`

```tsx
<script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(buildProductJsonLd(product, reviews)) }} />
```

**`JSON.stringify` does not escape `<`, `>` or `/`.** A review body of `</script><script>alert(document.cookie)</script>` survives serialization intact and the HTML parser terminates the `<script>` element at the first `</script` sequence. The chain is real end-to-end: `features/reviews/review-rules.ts:24-29` only trims and length-checks (≤400), no escaping; inserted as `pending`; rendered once an admin approves.

**Mitigating factor:** an admin must approve the review, and the raw `</script>` is visible in the moderation UI. Real but imperfect — many stores rubber-stamp.

**Fix:** Escape `<`, `>`, `&`, `U+2028`, `U+2029` after `JSON.stringify` in **all four** JSON-LD components.

## 3.3 — MEDIUM — No `middleware.ts` — zero edge-level authorization, 42 hand-copied checks

**Confirmed: no `middleware.ts` exists.** The codebase says so itself (`lib/rate-limit-guard.ts:7`, `lib/supabase/server.ts:21`).

I audited every route: **20/20 admin API routes** check, **22/22 admin pages** check, **9/9 server action modules** authenticate. **There is no missing check today.** But the pattern is copy-pasted with inconsistent status codes (403 vs 401), and one new route written without the idiom is a full admin bypass that nothing catches.

**Fix:** Next.js 16 `middleware.ts` **does** run in the Worker. Add one that refreshes the session cookie and hard-blocks `/admin/*` and `/api/admin/*`. Add an ESLint rule / test asserting every file under `app/api/admin/**` imports `getCurrentAdmin`.

## 3.4 — MEDIUM — Cart `quantity` never validated server-side

**Location:** `features/order/order-request.ts` — the *entire* validator checks only that the cart is non-empty and rejects a client-supplied `total`. `quantity` passes straight through into the RPC.

**Impact:** A negative quantity on one line offset by a larger positive line yields a non-negative total while delivering `-N` to `reserve_order_inventory`, whose guard `quantity - reserved_quantity >= (item->>'quantity')::integer` is satisfied trivially by `-1` — so `reserved_quantity` is **decremented**, potentially below zero, defeating the stock check.

**Fix:** `Number.isInteger(q) && q > 0 && q <= MAX_QTY` in the validator, plus a `> 0` guard inside `reserve_order_inventory`.

## 3.5 — MEDIUM — Client-supplied `variantId` trusted for inventory reservation

**Location:** `features/order/supabase-repository.ts:30` — `variantId: line.variantId ?? variant?.id`

`unitPrice` is correctly derived from the DB by matching `variantName`, but `variantId` **prefers the client's value** — and that's what reaches `reserve_order_inventory`. An attacker orders variant A (paying A's price) while reserving stock from variant B: depleting a scarce variant at the cheaper price, or forcing `INSUFFICIENT_STOCK` for others.

**Fix:** `variantId: variant?.id` — drop `line.variantId ??`.

## 3.6 — MEDIUM — Promo `max_uses` TOCTOU race

`features/promo/apply.ts:18` reads `used_count` in JS; the increment happens much later inside `create_pending_order`. Between them sit several awaits. N concurrent checkouts all pass validation — a `max_uses = 1` promo is redeemable N times.

**Fix:** Make it atomic inside the RPC: `update … set used_count = used_count + 1 where code = … and (max_uses = 0 or used_count < max_uses) returning 1 into v_ok; if v_ok is null then raise 'PROMO_MAX_USES';`

## 3.7 — MEDIUM — PostgREST `.or()` filter injection in admin order search

`app/admin/orders/page.tsx:28` interpolates the search term into `.or()` with only `.trim()` — no length cap, no escaping of PostgREST grammar characters (`,`, `.`, `(`, `)`, `%`). Admin-only, so not critical, but enables filter bypass, error/DoS and oracle probing.

## 3.8 — MEDIUM — Rate-limit key trusts spoofable headers

`lib/rate-limit.ts:65-76` trusts `CF-Connecting-IP` then `X-Forwarded-For` unconditionally. `CF-Connecting-IP` is safe **only** on Cloudflare; off-Cloudflare (local dev, `wrangler dev`, any proxy path) an attacker sets it to a random value and gets a fresh bucket per request.

**Fix:** Only trust `CF-Connecting-IP` when `getDeploymentRuntime() === 'cloudflare'`; add `user.id`-based limits for authenticated endpoints.

## 3.9 — MEDIUM — No rate limiting on auth, admin, cron, webhook

`RATE_LIMITS` defines only 7 rules. **Unprotected:** all 20 `/api/admin/**` routes, `/login` + signup + forgot-password (which bypass Next.js entirely by calling Supabase directly from the client), all 5 cron routes (**unlimited online guessing of `CRON_SECRET`** — `timingSafeEqual` defeats a timing oracle, not unlimited guesses), `/api/orders/[id]`, unsubscribe.

## 3.10 — MEDIUM — `zod` is in `devDependencies` but imported by 5 production runtime modules

Includes two production API routes (`app/api/wishlist/sync/route.ts:2`, `app/api/personalization/picks/route.ts:2`). Any `npm ci --omit=dev` yields **`MODULE_NOT_FOUND` at request time**. It also signals validation is treated as a dev-time concern — consistent with 52 of 57 routes having no schema validation at all.

## 3.11 — Low

| Finding | Location |
|---|---|
| Open redirect via `accountBase()` accepting `//evil.com` | Server Actions |
| `poweredByHeader` not disabled (leaks `X-Powered-By: Next.js`) | `next.config.ts` |
| `images.remotePatterns` uses `**.supabase.co` — wildcard across *all* Supabase projects | `next.config.ts:20` |
| Logger redaction excludes `email`\|`phone`\|`recipient` → **PII is logged** (GDPR retention concern) | `lib/logger.ts:12` |
| Unsubscribe token is deterministic and non-expiring — a permanent credential | `preferences-service.ts:23-31` |
| Turnstile fails open when secret unset (`if (!secret) return 'pass'`) | `lib/turnstile.ts:25` |
| `undici` High advisory — transitive via `stagehand` (E2E tool) and `wrangler` (build tool); **neither ships in the Worker bundle** | `npm audit` |

### Verified-positive security controls

These are commonly got wrong and are correct here:

| Control | Evidence |
|---|---|
| No `getSession()` trust on the server | **0 call sites**; `getUser()` everywhere |
| Server-side price recomputation | `features/order/supabase-repository.ts:15-32` rebuilds every line from the catalog |
| Client totals explicitly rejected | `features/order/order-request.ts:4` (`'client_total_not_allowed'`) |
| Webhook HMAC + timing-safe compare | `paymob-hmac.ts:58-63`; SHA-512, secret from server-only env |
| Webhook amount revalidation vs DB | `webhooks/paymob/route.ts:88-92` quarantines mismatches |
| Refund-callback poisoning blocked | `webhooks/paymob/route.ts:45`, `:112` (status transition guarded) |
| DB perimeter | `028_hardened_privileges.sql` — revokes EXECUTE from PUBLIC, deny-by-default |
| Role-escalation trigger | `005_customer_accounts.sql:30-51` |
| Gift-card entropy (2^80) + AES-GCM at rest | `features/gift-cards/crypto.ts` — **no modulo bias** |
| Refund-guard correctness | `021_gift_card_refund_guard.sql` — prevents minting credit three ways |
| Per-resource ownership (`id` + `customer_id`) | addresses, occasions, subscriptions, change-requests — **no IDOR found** |
| Server Action re-authentication | 9/9 modules; deliberate documented testing seam |
| Upload validation | magic-byte checks + UUID filenames, no path traversal |
| No secrets in client bundle | 0 non-`NEXT_PUBLIC_` refs in client files |
| No committed credentials | 1,374 tracked files scanned; `.env.local` untracked and ignored |
| Security headers + CSP | `next.config.ts:46-58` |
| Cron auth, timing-safe, fail-closed | `lib/cron.ts:31-38` |
| Email header injection prevented | static per-locale subjects, SDK-encoded headers |
| No SQL injection | all 15 `.rpc()` calls pass parameter objects; no `EXECUTE format(...)` anywhere |

---

# 4. Code quality & maintainability

**Rating: Good.** `tsc --noEmit` is clean at **0 errors with 0 `@ts-ignore` and 0 `@ts-expect-error`** across 465 files — rare, and it means the type system is doing real work rather than being bypassed.

## 4.1 — HIGH — No `@typescript-eslint` at all

**Location:** `eslint.config.mjs` (33 lines) — the entire ruleset is `eslint-config-next/core-web-vitals` + `react-hooks`

`@typescript-eslint/no-explicit-any`, `no-unsafe-assignment`, `no-floating-promises` are all unavailable. **There is no lint rule preventing `any`** — which explains the 46 `any` usages (29 `as any` + 17 `: any`), concentrated in the two newest modules (`features/subscriptions/*` = 16, `features/personalization/wishlist-sync.ts` = 7). Root cause: **Supabase joins return untyped nested relations.**

**Fix:** Install `@typescript-eslint`, enable `recommended-type-checked` with `no-explicit-any: 'warn'` initially. Then run `supabase gen types typescript` — that one command deletes ~20 of the 29 `as any` in a single pass.

## 4.2 — HIGH — No error taxonomy; inconsistent error contracts

`lib/errors/` is a single 8-line file. `lib/api.ts` is a 12-line *mapping* helper, not a handler. Every one of the 55 routes hand-writes its own `try/catch` + `logger.error` + status choice.

Measured distribution:

| Status | Messages observed |
|---|---|
| 401 | `'Authentication required'` (16) / `'Unauthorized'` (12) |
| 403 | `'Admin authorization required'` (14) / `'Forbidden'` (4) |
| 400 | `'Invalid body'` (9) / `'Unknown action'` (4) / `'Invalid action'` (3) / `'Malformed request'` (3) |

**Two messages for the same 401, two for 403, four for 400.** Any API consumer must string-match on prose.

**Fix:** `AppError` base + `ValidationError`/`AuthError`/`ForbiddenError`/`NotFoundError`/`ConflictError` each carrying a machine-readable `code`; a `withRoute()` wrapper; response shape `{ error: { code, message } }`.

## 4.3 — HIGH — External calls have no timeouts (except Paymob)

**48 `fetch()` calls; only 2 carry a timeout signal; 0 `AbortController`.**

| Integration | Timeout | Retry |
|---|---|---|
| Paymob | ✅ 10s | ❌ |
| Upstash | ✅ | ✅ |
| **Groq** | ❌ | ✅ (model-chain fallback — genuinely excellent) |
| **Resend** | ❌ | ❌ |
| **Nodemailer/Gmail** | ❌ | ❌ |
| ~30 admin-component fetches | ❌ | ❌ |

On Cloudflare Workers a hung upstream socket consumes the request's isolate budget — a stuck request, not a graceful failure.

## 4.4 — HIGH — API route coverage: 26 of 55 routes (47%) have no test

**The entire `/api/admin/**` write surface (17 routes) has no route-level test.** Also untested: `promo/validate`, `gift-cards/purchases`, `orders/[id]`, `delivery-fee`, all 5 cron routes. And **RLS/database policies: 38 `enable row level security` statements, 33 policies, 0 tests** — `tests/security/` contains exactly one file, and it's a secret scanner, not authz.

**Fix (P0):** route-level authz tests for all 17 admin routes. `tests/routes/gift-card-admin.test.ts` is a **13-line template** — replicate it.

## 4.5 — HIGH — Repository pattern proven but only 13% adopted

`getAdminSupabase()` is called **113 times**, **111 outside any repository**. Raw `.from('table')` appears in 78 files, of which **68 are not repositories** — including **22 `app/` pages and route handlers** (19 distinct tables). The `app/admin/*/page.tsx` files are effectively an untested second data-access layer.

The pattern that *does* exist is genuinely good (`features/catalog/provider.ts:7-11` env-swaps between local and Supabase repositories).

**Fix (incremental):** prioritize the Paymob webhook (5 direct queries on the money path) and the 7 `subscription_plans` stragglers; then add an ESLint `no-restricted-imports` rule banning `@/lib/supabase/admin` outside `**/repository.ts` / `**/provider.ts` / `app/api/**`. Let the linter stop the bleeding.

## 4.6 — HIGH — 15.5 MB (78%) of the tracked repository is vendored AI tooling

| Directory | Files | Size | Verdict |
|---|---|---|---|
| **`.agents/skills/`** | 594 | **13 MB** | ❌ should not be tracked |
| **`docs/superpowers/`** | 76 | 2.2 MB | ❌ vendored skill pack |
| `docs/stitch-export/` | 11 | 260 KB | ⚠️ design-tool artifacts |
| `docs/operations/` + `docs/setup/` | 3 | — | ✅ real documentation |

So of 91 `docs/` files, **87 are vendored or generated** and **3 are real**. `.agents/` is not in `.gitignore` while `.claude/`, `.freebuff/`, `.superpowers/`, `.worktrees/` all are — inconsistent. **One `git rm -r --cached` removes ~15 MB / 670 files.**

*Correction to a common assumption:* `stitch_rosette_floral_e_commerce_system/` is **not** committed (correctly gitignored); `tsconfig.tsbuildinfo` and `.next` are **not** committed either.

## 4.7 — HIGH — Five stray AI-generated review files in the repo root

`overview.md`, `ui-design-review.md` (20 KB), `visual-ui-ux-review.md` (24 KB), `visual-ui-ux-overview.md`, `dark-mode-fix-overview.md` — all created 30 Aug, all **untracked**. They're transient session deliverables that reference each other in a chain. **22 modified files are sitting uncommitted on `master`** (no feature branch, breaking the team's own PR pattern), so the next `git add -A` commits all five plus `.workbuddy-ai/`.

## 4.8 — Medium

| Finding | Location |
|---|---|
| Validation not centralized — three competing mechanisms (zod ×5, hand-rolled `validate*()`, inline ad-hoc) | The checkout body is **shape-asserted, not validated**; malformed bodies 503 instead of 400 |
| `requireAdmin` exists and has **0 callers** — the guard is copy-pasted 44 times across 41 files | `features/auth/server.ts` |
| `Customer` type declared **3× byte-identical**; same for `Client` | `account/`, `gift-finder/`, `occasions/` `action-internals.ts` |
| Date formatting: a `localeTag()` helper exists and is bypassed 2:1 (12 inline vs 6 correct) | `lib/date.ts` + 12 files |
| 9 orphaned files, 579 LOC — including **three dialog implementations, none shared** | `components/ui/{dropdown-menu,dialog,modal,checkbox,radio-group,switch}.tsx`, `components/support/*`, `hooks/useReducedMotion.ts` |
| E2E never runs — `tests/e2e/` has 7 files but no `playwright.config.*` and **no CI job**; `motion-foundation.spec.ts` and `motion-reduced.spec.ts` are orphaned | `.github/workflows/` |
| `app/layout.tsx:64` is a **792-character single line** with 5 nested providers — unreviewable | `app/layout.tsx` |
| Migration `023` is missing from the sequence (022 → 024) | `supabase/migrations/` |
| `exactOptionalPropertyTypes`, `noImplicitReturns`, `forceConsistentCasingInFileNames`, `verbatimModuleSyntax` all off; `target: ES2017` low for Workers | `tsconfig.json` |

## 4.9 — What's done well (code quality)

- **`tsc --noEmit` clean at 0 errors**, 0 `@ts-ignore`, 0 `@ts-expect-error`, 2 `eslint-disable`, 1 `console.log` in 465 files.
- **Money is not duplicated** — I looked hard. `features/money.ts` is the single formatter; minor units used consistently; no client/server price-math duplication.
- **The Paymob webhook is production-grade** — body-size cap, HMAC via query param with body fallback, refund-callback discrimination, amount-mismatch quarantine that acks 2xx so Paymob stops retrying, idempotency keys, PII sanitization, background notification delivery. The hardest handler in a commerce app, and the best one here.
- **Testing is behaviour-focused with zero snapshots.** 1,256 tests in 15s, **81% requiring no mocks**, Supabase mocked at the `getAdminSupabase` factory rather than the client, 27-line setup file with justified stubs.
- **CI gates are real** — `pr-checks.yml` and `deploy-cloudflare.yml` both run full suite + `tsc` + `eslint`; deploy additionally runs `cf:build` with a worker-size check.
- **Error swallowing is minimal** — 125 catch blocks, only 5 empty (4%), and 4 of those are correctly-guarded `localStorage` access.
- **0 TODO / FIXME / HACK / DEPRECATED** in 465 files.
- **Conventional Commits throughout** with scope prefixes and explanatory bodies.
- **0 default exports** in `components/` + `features/`; coherent file naming; all 6 server actions colocated in `features/`.

---

# 5. Architecture & design patterns

**Rating: Needs Work.** Dependency *direction* is clean — the problems are internal consistency and two runtime cycles.

## 5.1 — HIGH — Two **runtime** circular dependencies

```
catalog → order → cart → catalog
order   → checkout → order
```

Exact value-import edges: `features/catalog/supabase-repository.ts:2` → `features/order/delivery-rules`; `features/order/supabase-repository.ts:1` → `features/cart/pricing`; `features/cart/CartLineItem.tsx:5` → `features/catalog/add-on-labels`; `features/order/supabase-repository.ts:2` → `features/checkout/recipient-groups`; `features/checkout/CheckoutForm.tsx:27` → `features/order/local-repository`.

The **type-only graph is fully acyclic** (30 edges, 0 cycles) — four apparent cycles are entirely `import type` and erased at build time. But the `catalog↔order↔cart` cycle is the **checkout hot path**. It is latent today (ESM hoisting) but will produce `undefined` at import time the moment any module adds a top-level side effect — a classic "works locally, breaks in the Worker bundle" failure.

**Fix:** two extractions — `delivery-rules` → `features/delivery/rules.ts` (kills `catalog→order`), `calculateCartTotals` → `features/money/totals.ts` (kills `order→cart`). Then add `import/no-cycle`.

## 5.2 — HIGH — Feature module internal structure is inconsistent

Only **4 of 31** modules implement the full three-layer pattern.

| Module | types | repository | provider | service | validation |
|---|---|---|---|---|---|
| catalog, order, blog, personalization | ✅ | ✅ (local + supabase) | ✅ | ❌ | ❌ |
| account, gift-finder, occasions, promo, subscriptions | partial | ✅ (single) | ❌ | partial | partial |
| cart, checkout, admin, payment, gift-cards | partial | ❌ | ❌ | partial | partial |
| **support, theme, inventory, delivery, destination, commerce, tracking, chat** | partial | ❌ | ❌ | ❌ | ❌ |

`features/support/` = 1 file; `features/cart/` = 18 files. **`features/money.ts` is a bare file sitting among 31 directories.**

**Fix:** Ratify two tiers — **Tier A** (data-source swappable: types + 2 repositories + provider) for catalog/order/blog/personalization only; **Tier B** (Supabase-only: types + repository + service + validation) for everything else. Do not boil the ocean.

## 5.3 — HIGH — Route handlers are thin ✅ but validation is not centralized

1,718 lines across 55 routes = **~31 lines average** — genuinely good. `app/api/cron/subscriptions/route.ts` (22 lines) is textbook. `app/api/webhooks/paymob/route.ts` (141 lines) earns its complexity.

But `app/api/orders/route.ts:52-54` launders types through `Parameters<ReturnType<typeof getOrderRepository>['createPending']>[0]['cart']` instead of validating them — the **highest-value input in the app is shape-asserted, not validated**.

## 5.4 — Medium

| Finding | Location |
|---|---|
| Provider sprawl — 5 nested client providers in the root layout; `/admin` and `/login` ship cart + wishlist JS they never use | `app/layout.tsx:64` |
| `getAdminSupabase()` / `getBrowserSupabase()` build a **new client per call** (4× on the admin dashboard); browser client is not the documented singleton, so repeated calls can race on token refresh | `lib/supabase/` |
| Fan-in hotspots: `i18n` (16 dependents), `notifications` (8), `money` (7), `commerce` (6), `catalog` (6) | — |
| `components/ui/` drift — 4 of 28 files are hand-rolled, not shadcn; `skeleton.tsx` re-exports a motion component into the primitive layer | `components/ui/` |
| `CheckoutForm.tsx` at 610 lines is the one genuine hotspot (only 3 of 465 files exceed 300 lines; average is ~50) | `features/checkout/` |

## 5.5 — What's done well (architecture)

- **Direction is clean.** `features/` → `app/`: **0 imports**. `features/` → `components/` (59) and `lib/` (58) all downward. No feature escapes its root.
- **No barrel-file problem** — `find features -name "index.ts"` → **0 results**. Tree-shaking unimpeded.
- **The `provider.ts` data-source abstraction is elegant** — env-driven swap between local and Supabase repositories.
- **Server/client boundary is clean** — 120 `'use client'`, 6 `'use server'` all colocated in `features/`, 0 client components importing `@/lib/supabase/admin`, all 7 `localStorage`/`window` uses properly guarded.
- **`action-internals.ts` is a deliberate, documented testing seam** — and the comment *"Never expose these as 'use server' exports — every export of a server action module is remotely callable"* shows real security awareness.
- **No client-side auth store, no Redux/Zustand/Jotai** — restrained and appropriate.

---

# 6. UI/UX design consistency & usability

**Rating: At Risk.** Prior review passes documented in root markdown files claimed fixes; this audit **verified each claim against code**. Several were only partially implemented.

## 6.1 — CRITICAL — The homepage is entirely untranslated

**Location:** `app/[locale]/[city]/(home)/page.tsx:29-41, 78, 88` — **verified**

```tsx
const FEATURED = [
  { name: 'The White Edit', price: 'EGP 1,250', badge: 'Same-day Maadi', … },
  { name: 'Crimson Dusk',   price: 'EGP 1,800', badge: 'Pre-order', … },
  { name: 'Morning Light',  price: 'EGP 950',   badge: 'Same-day Zamalek', … },
  { name: 'Single Stem Gift', price: 'EGP 350', badge: null, … },
];
const FEELINGS = [
  { label: 'For Love', … }, { label: 'Sympathy', … },
  { label: 'Birthdays', … }, { label: 'Just Because', … },
];
```

Four product names, four **price strings** (bypassing `Intl`/`formatMoney`), four delivery badges, four occasion labels, the section heading, and the hero `alt`. Also every card links to `/shop` rather than the PDP.

**Impact:** An Arabic visitor to `/ar/cairo` sees a page whose heading, all four product names, all four prices and all eight category labels are English — with `dir="rtl"` applied to English text, producing garbled bidirectional runs where `'EGP 1,250'` renders as `1,250 EGP` with the currency code displaced. The hardcoded price also **bypasses `Intl`**, so Arabic users get Latin digits instead of `١٬٢٥٠ ج.م.`. This is the first impression for every non-English user.

## 6.2 — CRITICAL — Checkout inputs have no visible focus indicator

**Location:** `features/checkout/CheckoutForm.tsx:40` — **verified**

```
… focus-visible:border-primary focus-visible:ring-0 focus-visible:ring-offset-0 …
```

Applied to all checkout fields (lines 243-441). The only remaining affordance is a 1px border change on a 56px-tall pill.

**Impact:** A keyboard-only or low-vision user filling out the checkout form — recipient name, phone, email, address, delivery date, delivery window, card fields — has essentially no indication of which field they are in. **This is a regression against the focus work the prior review describes elsewhere in the same file**, which is otherwise excellent.

**Fix:** delete `focus-visible:ring-0 focus-visible:ring-offset-0`; restore `focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2`.

## 6.3 — HIGH — `text-sage` fails WCAG AA (3.37:1); the prior "darker sage token" fix is only 6/31 migrated

`--color-sage: var(--color-accent)` → `#6f8f6d`. Measured contrast: **3.37:1** on canvas `#fdf6f0`, **3.60:1** on white, **3.26:1** on surface-container-low. Used **31 times across 28 files**, almost always on `text-xs` (12px) eyebrow labels — which do **not** qualify for the 3:1 large-text exemption.

`--color-sage-ink` (`#476647`, 6.02:1) was added and used correctly in 6 places. **25 of 31 usages were never migrated.** Affected: the 404 page, the error page, all eight account/auth pages, blog/delivery content pages, and the **success confirmation message** in email preferences.

**Fix:** change the token, not the call sites — `#6f8f6d` → `#4f6f4d` (4.9:1).

## 6.4 — HIGH — All card/input/divider borders fail WCAG 1.4.11 Non-text Contrast

| Token | Value | vs canvas | vs surface-container-low |
|---|---|---|---|
| `--color-border` / `--color-input` | `#e0c2c7` | **1.54:1** ✗ | **1.49:1** ✗ |
| `--rt-outline-variant` | `#ddbfc4` | **1.59:1** ✗ | **1.54:1** ✗ |
| `border-outline-variant/30` (blended) | — | **1.14:1** ✗ | — |
| `border-outline-variant/20` (blended) | — | **1.09:1** ✗ | — |

Dark mode is worse (`--rt-outline` hover at 2.21:1). `border-outline-variant/30` is the **default card border** across the whole storefront. This directly undermines the prior review's "checkout scannability" work — the boundaries meant to structure the page are below the perceptual threshold.

## 6.5 — HIGH — RTL: 96 physical properties vs 22 logical (4.4 : 1)

| Physical | Occ | Files | Logical | Occ | Files |
|---|---|---|---|---|---|
| `pl-` / `pr-` | 23 | 9 | `ps-` / `pe-` | **0** | **0** |
| `left-` / `right-` | 27 | 13 | `start-` / `end-` | 4 | 2 |
| `text-left` / `text-right` | 16 | 13 | `text-start` / `text-end` | 16 | 8 |
| `border-l` / `border-r` | 6 | 5 | `border-s` / `border-e` | **0** | **0** |

**Zero `ps-`/`pe-`/`border-s`/`border-e` usages in the entire codebase.** Highest-impact sites: `components/ui/select.tsx:112` (`pr-8 pl-2` — the check indicator at `:119` **overlaps the text** in Arabic), `sheet.tsx:78` / `dialog.tsx:73` (close ✕ on the wrong side of every modal and drawer), `FulfillmentProgress.tsx:41` (`absolute left-[15px]` — **the timeline rail disconnects from the content**), `EmailPreferences.tsx:39` (toggle knob animates the wrong way).

**Fix:** an ESLint rule banning physical properties outside `components/ui/`, plus `rtl:` overrides for the Radix primitives that can't be rewritten.

## 6.6 — High / Medium

| Sev | Finding | Location |
|---|---|---|
| H | **No skip-to-content link on any of 57 pages** (WCAG 2.4.1 A) — keyboard users traverse the entire header cluster on every page | `app/layout.tsx` |
| H | **`badge.tsx:16` still uses `text-white`** — dark mode renders white on `#e06a5c` at **2.4:1**. The `dark-mode-fix-overview.md` claim is true of `button.tsx` but the primitive was missed. `success`/`warning` variants at 3.93/3.58:1 | `components/ui/badge.tsx` |
| H | **Cart + checkout funnel steppers are hardcoded English** *and* duplicated — `'Bag'`/`'Delivery'`/`'Payment'` in two near-identical components | `cart/page.tsx:11,16,21`; `checkout/page.tsx:16,21,26` |
| H | **`EmailPreferences` has ~18 hardcoded strings including all `aria-label`s** — Arabic/French users hear English toggle names from their screen reader; the button label is `'Save changes'` while the loading state is `t('processing')` | `components/account/EmailPreferences.tsx` |
| H | **Touch targets below 44×44**: quantity stepper ~30×30 (most-tapped control in the cart, adjacent to a Remove button), chat close `×` ~20×20 (fails even the 24px AA minimum), `Button` default 36px, `icon-xs` 24px, `icon-sm` 32px | various |
| M | Three parallel token families coexist — shadcn (566 occ / 103 files), Material-RT (676 / 57), Rosette-native (87 / 47). The Material family is now **largest**, and `globals.css` aliases one onto the other so the same visual result has two names kept in sync manually | `globals.css:5-112` |
| M | `@theme inline` has duplicate declarations that silently overwrite — `--color-secondary` defined twice (the `#476647` green at `:39` is **dead code**), `--radius-md` is 13px in one block and 16px in another | `globals.css:29-102` |
| M | `text-accent-foreground` on `bg-accent` = **3.25:1** — every hover and keyboard-focus state in the language switcher, sort dropdown and selects | `globals.css:84,85` |
| M | **Three different `Intl` locale mappings** (`en-US` / `en-GB` / `en-EG`) — the same date renders three ways on three consecutive screens (cart → checkout → tracking) | `translate.ts`, `CheckoutForm.tsx:188`, `track/page.tsx:52` |
| M | `ProductCard` still uses a non-interactive `article` with `cursor-pointer` and **two duplicate links** to the same product — keyboard users tab twice per card; screen readers announce the link twice. Prior P1, **not implemented** | `ProductCard.tsx:27,29,52` |
| M | **Destination gate submits silently** — `if (!cityCode) return;` with no feedback. The very first interaction on the site can fail silently. Country list is also untranslated | `DestinationGate.tsx:29,83` |
| M | 16 hardcoded `shadow-[…rgba…]` literals (3 shadow tokens already exist and are unused); `DestinationGate.tsx:144` has a **light-only inset glow** that renders as a washed-out haze in dark mode | 9 files |
| M | `fr.json` has **36 values byte-identical to English** — `navCollections`, `navAtelier`, `pagination`, `total` are ordinary UI nouns that were never translated | `features/i18n/locales/fr.json` |
| M | Text-expansion clipping: `max-w-[12ch]` on a heading (too few for Arabic/French), `whitespace-nowrap` on select triggers, `truncate` on recipient names | 5 sites |
| M | 5 distinct container recipes → alignment differs by up to 24px between `/shop` and `/checkout` at the same viewport | 7 sites |
| M | 91 arbitrary `text-[Npx]` values + two competing type scales, neither authoritative | 18 files |
| M | 4 different CTA radii and 5 different CTA heights across one funnel — the user's motor memory resets at each transition | 8 surfaces |
| M | `100vw` full-bleed hack in the sticky catalog toolbar — `100vw` includes the scrollbar, so Windows Chrome/Edge gains a spurious horizontal scroll on `/shop` | `CatalogToolbar.tsx:30` |
| M | Chat FAB at `bottom-5 end-5` on **every** page including `/checkout`, where it can overlap the CTA | `ChatWidget.tsx:37` |
| M | Mobile PDP gallery has no thumbnail alternative (`hidden … md:flex`) — mobile users see one image and cannot inspect the product | `ProductDetail.tsx:62` |
| M | `StatusMessage` has no `aria-live`; `Field` error has no `role="alert"` — forms built on the shared `Field` primitive announce nothing on validation failure | `status-message.tsx`, `field.tsx:15` |
| M | 66 raw Unicode glyphs used as icons (`↗ → ✿ ◌`) — don't flip for RTL, and `✿` on the track page is decorative without `aria-hidden` | 35 files |

## 6.7 — Verification of prior review claims

| Claim | Verdict | Evidence |
|---|---|---|
| Localized cart/checkout copy (en/fr/ar) | **Partially implemented** | ✅ `CartPageContent.tsx`, `CheckoutForm.tsx` fully localized. ❌ progress steppers, homepage, EmailPreferences outstanding |
| Localized quantity-control labels | ✅ **Implemented** | `CartLineItem.tsx:42,52` |
| Delivery-date labels | ✅ **Implemented** | `CheckoutForm.tsx:366-411` |
| ICU `#` plural replacement | ✅ **Implemented** | `translate.ts:55` |
| Checkout errors with stable IDs + `aria-describedby` + focusable alert | ✅ **Implemented** | `CheckoutForm.tsx:45-47, 205-209, 243-441` |
| Date choices with radio semantics | ✅ **Implemented** | `CheckoutForm.tsx:366-394` |
| Visible focus on choice controls | ✅ **Implemented** | `ProductDetail.tsx:54,55`; `CheckoutForm.tsx:277-296, 459-495` |
| Shared header-height token | ✅ **Implemented** | `globals.css:116,169`; `CatalogToolbar.tsx:30` |
| Mobile filter Sheet | ✅ **Implemented** | `CatalogToolbar.tsx:37-75` |
| **Darker sage text token** | ⚠️ **Partially** | ✅ `--color-sage-ink` added. ❌ **25 of 31 usages not migrated** |
| Balanced sparse catalog | ✅ **Implemented** | `CatalogGrid.tsx:30` |
| Shared card/control geometry tokens | ⚠️ **Partially** | ✅ tokens exist. ❌ conflicting duplicates remain |
| Checkout CTA grouped with total | ✅ **Implemented** | `CheckoutForm.tsx:597-599` |
| **Consolidate token system (P0-3)** | ❌ **Not implemented** | Three families, Material-RT now largest |
| **Standardised container + type scale** | ❌ **Not implemented** | 5 container recipes, 91 arbitrary values |
| **ProductCard `article` + `cursor-pointer`** | ❌ **Not implemented** | `ProductCard.tsx:27,29,52` unchanged |
| **Mobile header density (P1-03)** | ❌ **Not implemented** | `SiteHeader.tsx:62-69` unchanged |
| **Inconsistent shape language (P1-04)** | ❌ **Not implemented** | 4 radii, 5 heights |
| **Cards should link to PDP** | ❌ **Not implemented** | `(home)/page.tsx:93,131,144` still → `/shop` |
| Dark mode: destructive uses semantic foreground | ⚠️ **Partially** | ✅ `button.tsx`. ❌ `badge.tsx:16` still `text-white` |
| Pre-paint theme sync script | ✅ **Implemented** | `app/layout.tsx` `THEME_SYNC_SCRIPT` |

**Dictionary parity is perfect: 776 / 776 / 776 keys, zero missing, zero empty.** The i18n *infrastructure* is production-grade; the gaps above are content problems, not architecture problems.

## 6.8 — What's done well (UI/UX)

- **Breakpoint discipline is exemplary** — 171 `md:`, 58 `lg:`, 33 `max-md:`, 27 `sm:`, 5 `xl:`, and **zero** arbitrary `min-[…]`/`max-[…]` across 61 files. Rare.
- **The checkout accessibility work is genuinely good** — stable error IDs, `aria-describedby` on every field, `role="alert"`, a focusable group-level alert with `aria-live="assertive"`, `role="radiogroup"` on the date picker, `aria-pressed` on saved addresses, `has-[input:focus-visible]:ring-2` on hidden-input pills, CTA grouped with the total at 48px. Higher bar than most production storefronts.
- **Dark mode is engineered, not bolted on** — pre-paint sync script reading localStorage → cookie → `prefers-color-scheme`, `ThemeProvider` reading the SSR-applied class and deferring reconciliation, `color-scheme` set on `<html>`, full parallel dark palette with reconsidered foregrounds.
- **RTL at the document level is correct** — `dir` server-rendered from the URL segment, re-derived by sync script, re-applied by the provider, dedicated Arabic font via `html[lang='ar']` token swap. Failures are component-level, not framework-level.
- **Zero a11y anti-patterns in the obvious places** — no `<img>` without `alt`, no `div`/`span` with `onClick`, no positive `tabIndex`.
- **Empty states largely covered** — catalog, cart, wishlist, addresses, occasions, subscriptions, gift-finder, order-missing, track-lookup-failure, most with recovery CTAs.
- **`CatalogPagination` and `WishlistHeart` are reference-quality** — 44px targets, localized `aria-label`s, `aria-current`, `rel="prev"/"next"`.

---

# 7. Prioritized remediation roadmap

## P0 — This week (broken now, or trivially exploitable)

| # | Fix | Location | Effort |
|---|---|---|---|
| 1 | Fix `resolveProductVariant` — select `price_delta_minor`, resolve slug from `products` | `features/subscriptions/service.ts:21-26` | S |
| 2 | Add `release_expired_reservations` + cron + `(expires_at)` index | new `038` migration | M |
| 3 | Localize the homepage — move `FEATURED`/`FEELINGS` into the catalog, use `formatMoney` + `t()` | `(home)/page.tsx:29-41` | M |
| 4 | Restore the checkout focus ring — delete `focus-visible:ring-0` | `CheckoutForm.tsx:40` | **XS** |
| 5 | Fix `text-sage` at the token level (`#6f8f6d` → `#4f6f4d`) | `globals.css:183` | **XS** |
| 6 | Raise `--rt-outline-variant`; drop `/20`–`/30` opacity on structural borders | `globals.css:56,92,93,159,234` | S |
| 7 | Add `FOR UPDATE` + `GET DIAGNOSTICS` to `materialize_subscription_delivery` | `037:324,367` | S |
| 8 | Add the 6 missing `orders` indexes + `order_items(order_id)` | new `038` migration | **XS** |
| 9 | Sanitize blog/delivery HTML **and** enforce `role === 'admin'` on content endpoints | `blog/[slug]/page.tsx:45`, `delivery/page.tsx:37`, `api/admin/blog/*` | S |
| 10 | Escape `<`/`>` after `JSON.stringify` in all four JSON-LD components | `components/seo/*` | **XS** |
| 11 | Localize cart + checkout funnel steppers (and dedupe them) | `cart/page.tsx`, `checkout/page.tsx` | **XS** |
| 12 | Add a skip-to-content link | `app/layout.tsx` | **XS** |
| 13 | Fix `badge.tsx:16` `text-white` → `text-destructive-foreground` | `components/ui/badge.tsx` | **XS** |
| 14 | Gitignore + untrack `.agents/` and `docs/superpowers/` (**−15 MB / 670 files**) | `.gitignore` | **XS** |
| 15 | Branch the 22 uncommitted files; delete the 5 root review `.md`s; gitignore `.workbuddy-ai/` | repo root | **XS** |

## P1 — This sprint

| # | Fix | Area |
|---|---|---|
| 16 | Add route-level authz tests for all 17 `/api/admin/**` routes (13-line template exists) | Testing |
| 17 | Add `middleware.ts` for `/admin/*` + `/api/admin/*`; add a lint rule asserting `getCurrentAdmin` | Security |
| 18 | Validate cart `quantity` (integer, >0, ≤MAX) + add `> 0` guard in `reserve_order_inventory` | Security |
| 19 | Use the server-resolved `variantId` (drop `line.variantId ??`) | Security |
| 20 | Make promo usage atomic inside `create_pending_order` | Security |
| 21 | Move `zod` to `dependencies`; validate `/api/orders` and `app/api/admin/**` bodies | Security |
| 22 | Fix rate-limit IP resolution to be runtime-aware; add limits for login/signup/reset, admin, cron | Security |
| 23 | Install `@typescript-eslint`; generate Supabase types (`−20 of 29` `as any`) | Code quality |
| 24 | Move `cookies()` out of the root layout → unblocks static/ISR for ~680 routes | Performance |
| 25 | Wire up the existing `ChatWidgetLazy` (one-line import swap) | Performance |
| 26 | Dynamic-import `getBrowserSupabase` in `WishlistProvider` + `AccountNavItem` (**−45 KB gzip**) | Performance |
| 27 | Fix the admin gift-cards N+1 into one `.in()` query; add `.limit()` | Performance |
| 28 | Add `.limit()`/`.range()` + `Promise.all` to `readProducts()`; add `getBySlug` single-row query | Performance |
| 29 | Add `.limit(BATCH)` + batched preference lookups to the 4 unbounded crons | Performance |
| 30 | Convert `computeDashboardStats` to a SQL aggregate RPC | Performance |
| 31 | Break the 2 runtime cycles; add `import/no-cycle` | Architecture |
| 32 | Build the error taxonomy (`AppError` + `withRoute`); unify 401/403/400 messages | Code quality |
| 33 | Add timeouts to Resend, Nodemailer, Groq, admin fetches | Code quality |
| 34 | Adopt `requireAdmin()` in all 41 files (it already exists) | Code quality |
| 35 | RTL: ban physical properties in lint; fix `select`, `sheet`, `dialog`, `FulfillmentProgress` | UI/UX |
| 36 | Localize `EmailPreferences` (~18 strings incl. `aria-label`s) | UI/UX |
| 37 | Fix the 44px touch targets (quantity stepper, chat close, button variants) | UI/UX |
| 38 | Enable RLS on the 4 subscription tables; fix the 7 dead-policy tables | Database |
| 39 | Add the `037` subscription indexes; fix `upsert_cart` to actually use `ON CONFLICT` | Database |
| 40 | Revoke anon SELECT on `promo_codes` | Database |

## P2 — Next sprint

| # | Fix | Area |
|---|---|---|
| 41 | Consolidate the three token families; dedupe `@theme inline` | UI/UX |
| 42 | Single `resolveIntlLocale()`; fix `fr.json`'s 36 untranslated values | UI/UX |
| 43 | `ProductVisual` sizes/priority; consolidate CTA geometries and container recipes | UI/UX |
| 44 | Adopt tag-based invalidation before enabling any caching | Performance |
| 45 | Replace `nodemailer` with Resend; fix the 3 MiB worker-size threshold | Performance |
| 46 | Move catalog search to Postgres (`pg_trgm`); delete the Fuse module cache | Performance |
| 47 | Add Workers KV for catalog/blog caching | Performance |
| 48 | `loading.tsx` for the 31 pages missing one; make the 2 Suspense boundaries real | Performance |
| 49 | Delete 9 orphaned files (579 LOC); wire e2e into CI or delete it | Code quality |
| 50 | Enable `exactOptionalPropertyTypes`, `noImplicitReturns`, `verbatimModuleSyntax`; target ES2022 | Code quality |
| 51 | Split `app/layout.tsx:64`; move Cart/Wishlist providers to the storefront segment | Architecture |
| 52 | RLS/policy test suite; migration-integrity test; fix migration `023` gap | Database |
| 53 | Ratify the 2-tier feature structure; extract `payments-repository` from the webhook | Architecture |

---

## Appendix — Recommended verification before shipping

1. **`npm run cf:build`** then read the actual Worker gzip size — then fix `scripts/check-worker-size.mjs:9` to match 1 MiB (free) / 10 MiB (paid).
2. **`npm run analyze`** and read `.next/analyze/client.html` for real First Load JS numbers.
3. **`npm audit`** — the single High (`undici`) is transitive via `stagehand` and `wrangler`; neither ships in the Worker bundle. Bump `stagehand` when convenient.
4. **Confirm in production:** `UPSTASH_REDIS_REST_URL`/`TOKEN` (if unset, all rate limits degrade to per-isolate memory and are trivially bypassed) and `TURNSTILE_SECRET_KEY` (if unset, bot protection silently disappears with no warning).
5. **Confirm migrations were actually applied** to the live database — the SQL in this repo is correct, but remote state was not verified.
