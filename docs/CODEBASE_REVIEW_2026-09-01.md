# Rosette Codebase Review — Five-Dimension Audit

**Date:** 2026-09-01
**Scope:** `app/`, `features/` (33 modules), `lib/`, `components/`, `supabase/migrations/` (43), `tests/` (254 files)
**Stack:** Next.js 16 (App Router/RSC) · React 19 · TypeScript 5.9 · Supabase (Postgres + Auth + RLS) · Tailwind v4 · zod v4
**Deploy target:** Cloudflare Workers via OpenNext (`nodejs_compat` only — no Node `fs`, no native sockets, no `middleware.ts`)

> Method: three dimensions (Security, Performance, Architecture) were audited by independent sub-agents reading the actual source; Code Quality and Maintainability were audited directly by reading the code and running targeted searches. Every finding below cites a real path and was verified, not speculated.

---

## 1. Executive Summary

The codebase is **well-engineered in several respects** — RLS is carefully designed, the Paymob HMAC verification is sound and constant-time, the admin dashboard uses a single bounded RPC, money is integer minor units throughout, and CI runs typecheck + lint + unit + E2E on every PR. It is **not** a low-quality project.

However, several issues are **High impact** because they are either security-relevant money/authorization bugs, deploy-breaking runtime incompatibilities, or silent data corruption:

1. **Subscription checkout trusts client-supplied discounts** → anyone can get free subscriptions (money/theft).
2. **Migrations 038–040 are not applied to the live project** → promo codes are world-readable, subscription tables have RLS disabled, and the inventory-release cron fails (reservations silently brick variants).
3. **`nodemailer`/Gmail SMTP is used by 6 email features but cannot run on Cloudflare Workers** (no raw sockets) → email delivery is broken on the deploy target; only the order path uses the Workers-safe Resend transport.
4. **All dates render in UTC, not Africa/Cairo** → delivery windows, order times, and subscription schedules are shown 2–3h off to customers/admins.
5. **Security controls fail *open*** → rate limiting and Turnstile silently disable themselves when unconfigured (currently the case in production).
6. **No centralized pricing kernel** → delivery-fee constants drift across 5+ sites (server charges 1500 where the UI quoted 2500), and free-shipping promos charge a different amount than displayed.
7. **No caching layer exists** → every catalog/PDP page is forced dynamic and re-queries Supabase from scratch; ~208 KiB gz of client JS is wasted on server-only deps.

The single most important **systemic** theme: the stated convention *"logic in Postgres via RPCs, not JS"* is honoured for inventory/gift-cards but **abandoned for pricing**, and the absence of a `middleware.ts` chokepoint pushes auth/authorization into 80+ hand-maintained sites. Both create repeated, compounding risk.

---

## 2. Cross-Cutting Concerns (affect multiple dimensions)

| # | Concern | Dimensions | Why it matters |
|---|---------|-----------|----------------|
| **X1** | **No `middleware.ts` chokepoint** — auth/authorization is per-handler and per-page | Security, Architecture, Maintainability | Every guarantee depends on 80+ files each remembering its guard. One omission = open surface (see SEC-9, SEC-8). A shared `requireAdmin`/`requireCustomer` wrapper + route-level `withAuth()` collapses the surface. |
| **X2** | **Service-role client used everywhere → RLS is bypassed** | Security, Architecture | All reads/writes go through `getAdminSupabase()` (RLS off). Application-layer ownership filters are the *only* backstop against IDOR. One dropped `.eq('customer_id', …)` = data breach. |
| **X3** | **"Logic in Postgres" convention is violated for money** | Architecture, Security, Code Quality | `create_pending_order` is a dumb insert that trusts client totals; pricing is duplicated in cart/checkout/orders/subscriptions/gift-cards with drifting constants. Root cause of ARCH-1/2/3 and SEC-1. |
| **X4** | **Security controls fail *open* when unconfigured** | Security, Architecture | Rate limiting (SEC-4) and Turnstile (SEC-6) both silently no-op when secrets are absent — and they are absent in production today. Should fail *closed* when `DEPLOYMENT_RUNTIME=cloudflare`. |
| **X5** | **Timezone is never pinned to the business locale** | Code Quality, Correctness | `lib/date.ts` and `translate.ts` format with no `timeZone`; Workers run UTC. Every date/time shown to a Cairo customer is wrong by 2–3h. |
| **X6** | **Three unapplied migrations are load-bearing security/data fixes** | Security, Architecture, Operations | 038/039/040 are not features — they are the RLS, index, and inventory-release remediation. Migration application must be a verified deploy step, not manual. |
| **X7** | **Server-only deps leak into client chunks** | Performance, Maintainability | supabase-js, zod, full i18n payload, motion, core-js polyfills = ~208 KiB gz + ~110 KiB polyfills of the 2.5 MiB worker, all from incidental imports, not intentional use. |

---

## 3. Ranked Recommendations

Impact legend: **High** = security/money/correctness/deploy-breaking · **Medium** · **Low**. Effort legend: **Quick** (<1h) · **Med** · **Large**.

### Tier 1 — HIGH IMPACT

| ID | Dim | Area / Module | Issue (verified) | Fix | Effort |
|----|-----|---------------|------------------|-----|--------|
| **R-01** | Security / Correctness | `app/api/subscriptions/route.ts`, `features/subscriptions/service.ts:71` | Sub trusts `promoDiscountMinor` from the client; `discountMinor = Math.min(...,subtotal)` straight from body; `order.total_minor===0` → `activateSubscriptionIfPaid` with **zero payment**. Free subscriptions for anyone. | Server-side recompute: if `promoCode`, load via `fetchPromo` + `validatePromo`/`computeDiscount` (same as `/api/promo/validate`); reject when `promoDiscountMinor !== computed`. Mirror the order path's "no client total" rule. | Quick |
| **R-02** | Security / Data | `supabase/migrations/038,039,040` (unapplied) | 038 not applied → `anon` can `select *` from `promo_codes` (038:347 revokes it). 040 not applied → 4 subscription tables have **RLS disabled**. 038 also adds `release_expired_reservations` RPC that the inventory cron needs. | Apply 038–040 to the live project. Add a CI schema-drift/`schema_migrations` checksum gate. | Quick |
| **R-03** | Architecture / Runtime | `features/notifications/gmail-mailer.ts` + 6 callers (`cart/abandoned-email`, `gift-cards/purchase-email`, `occasions/email`, `subscriptions/email`, `wishlist/email`, `notifications/notification-service`) | `nodemailer.createTransport({service:'gmail'})` opens a raw TLS socket. **Cloudflare Workers cannot do TCP/TLS** (only `fetch`). These paths fail at runtime on the deploy target. Only the order path uses Resend (HTTP), which works. | Consolidate all transactional email on Resend (HTTP) or an edge SMTP-over-HTTPS relay. Remove `nodemailer`. Verify the other 6 features actually send on Workers. | Med |
| **R-04** | Security | `lib/rate-limit.ts:48`, `lib/turnstile.ts:25`, `lib/rate-limit-guard.ts` | With Upstash/secret unset, `checkRateLimit` silently falls back to per-isolate in-memory (effectively unenforced across isolates); `checkTurnstileToken` returns `'pass'` when `TURNSTILE_SECRET_KEY` is unset. Both are unconfigured in prod today → bot/abuse protection is absent. | Fail *closed* in `cloudflare` runtime: throw/deny when Upstash is missing; `turnstile` should return `'missing'` (not `'pass'`) off-local-dev. Apply rate limiting to admin + gift-finder + vote GET. | Med |
| **R-05** | Code Quality / Correctness | `lib/date.ts:18,24`, `features/i18n/translate.ts:117` | `toLocaleString`/`toLocaleDateString`/`Intl.DateTimeFormat` called with **no `timeZone`**. Workers run UTC → every delivery window, order timestamp, and subscription schedule displays in UTC, not `Africa/Cairo` (off by 2–3h). | Pass `timeZone: 'Africa/Cairo'` (or per-city TZ from config) in `formatDateTime`/`formatDate` and the `translate` formatters. Audit `ProductDetail.tsx:39` hydration-mismatch note. | Quick |
| **R-06** | Architecture / Money | `features/order/delivery-rules.ts:9`, `features/destination/delivery-fee.ts:4-5`, `app/api/delivery-fee/route.ts:16`, `features/cart/CartProvider.tsx:42`, `features/catalog/{local,supabase}-repository.ts:40,169` | Five copies of the delivery-fee constant. Server `applyDeliveryRule(rule,0)` defaults to **1500**; client `estimateDeliveryFeeMinor` returns **2500** for next-day cities. → systematic 10 EGP undercharge, UI ≠ charged. Also `create_pending_order` stores totals verbatim with no `CHECK` invariant. | One `resolveDeliveryFee(cityCode, subtotal)` helper; delete the scattered literals and `FLAT_*` constants. Add `CHECK (total_minor = subtotal + delivery_fee - discount - gift_card)` to `orders` (backfill first). One server-side pricing kernel `computeOrderTotals(...)`. | Quick (const) / Med (invariant) |
| **R-07** | Performance | `features/cart/CartSync.tsx:4`, `motion/MotionProvider.tsx`, `features/occasions/validation.ts`, `features/i18n/I18nProvider.tsx`, `.next` core-js chunks | Server-only deps in client bundles: supabase-js 64.4 KiB gz (33 routes), `motion` 43.8 KiB (51 routes, config-only wrapper), zod 65.7 KiB (via 2 const arrays), full i18n dicts 34.4 KiB (51 routes), ~110 KiB core-js polyfills. ~208 KiB gz removable by import-graph fixes alone. | `CartSync`/`AccountNavItem` dynamic-import the browser client; drop `MotionProvider` (use `prefers-reduced-motion` + existing cookie); move `OCCASION_KINDS`/`LEAD_DAY_CHOICES` to `constants.ts`; pass the active-locale dict from the layout; add a modern `browserslist`. | Quick–Med |
| **R-08** | Performance | `app/[locale]/[city]/shop/[slug]/page.tsx:44`, `…/shop/(list)/page.tsx:41`, `lib/…/server.ts` | Personalization `createClient()` + `getUser()` in the page body opts the whole catalog/PDP subtree into **dynamic** rendering. No `revalidate`/`generateStaticParams` anywhere in `app/`. `Suspense` boundaries wrap *already-resolved* data, so nothing streams. | Remove `cookies()` from the page; move personalization into a `<Suspense>` island server component. Add `export const revalidate = 3600` + `generateStaticParams` for `[slug]`. Add `revalidatePath`/`revalidateTag` to admin mutations (PERF-11). | Med |
| **R-09** | Security | `app/api/orders/[id]/route.ts`, `lib/supabase/admin.ts` (service role) | `orders/[id]` does pure bearer-token lookup with **no** user binding, **no** rate limit, **no** `Cache-Control`. Service-role client means RLS is off (X2). Returns full PII. The public token is unguessable but travels in URLs/emails. | Add `enforceRateLimit` + `Cache-Control: private, no-store`. Add a lint/test rule asserting every `getAdminSupabase()` in `app/api/**` passes an authenticated owner id. Long term, read paths use the cookie client so RLS is a backstop. | Med |
| **R-10** | Architecture / Operations | `supabase/migrations/` numbering, live vs repo schema | Non-monotonic migration numbering (three different `033_*`), 038–040 unapplied → **live schema provably differs from repo**. `nodejs_compat` + no `middleware` already constrain; non-reproducible deploys are the top operational risk. | Snapshot live schema (`supabase db dump`) and diff against a scratch DB; add checksum assertion to CI; record the applied-set in the repo. | Med |
| **R-11** | Architecture | `features/subscriptions/*` (state machine), `features/commerce/order-state.ts:22` | Subscription status has **no transitions map** (bare literals across 6 files). `canTransitionPayment` is **dead** (zero production callers) yet payment status is written directly in 5 places (paymob webhook, cancel-actions, subscriptions-cron). Money-bearing transitions unenforced. | Add `subscriptionTransitions`; wire `canTransitionPayment` into every `.update({payment_status})` site (esp. the paymob webhook). | Med |

### Tier 2 — MEDIUM IMPACT

| ID | Dim | Area / Module | Issue (verified) | Fix | Effort |
|----|-----|---------------|------------------|-----|--------|
| **R-12** | Performance | `features/admin/notification-admin.ts:47-72` | Notification admin loads *all* failed/pending rows, then filters/sorts/paginates **in JS** — direct violation of the Postgres-RPC convention; unbounded Worker memory. | Convert to a bounded RPC (`LIMIT`/`OFFSET`, `isStuckRow` in SQL) mirroring `039_dashboard_rpc.sql`. | Med |
| **R-13** | Security | `app/api/**` (55/57 handlers) | Bodies parsed with `as` casts, not zod. `admin/subscriptions/plans/route.ts:60` inserts client `bundle_prices` + unvalidated `productId` directly. | Add zod schemas for highest-value writes (product, promo, plan, order request); replace casts with `safeParse`. | Large |
| **R-14** | Security | `app/api/reviews/[id]/vote/route.ts` | Anonymous voters identified by a client-supplied `?visitor=` string → unlimited ballot stuffing of "helpful" votes. GET has no rate limit. | Issue a signed HttpOnly `visitor_id` cookie (or hash `CF-IP + UA + secret`); add rate limit to GET. | Med |
| **R-15** | Security | `app/api/webhooks/paymob/route.ts` | HMAC is sound, but **no nonce/timestamp freshness** and no processed-event ledger → a captured callback can be replayed to flip `payment_failed → paid` or re-trigger notifications. | Persist `provider_reference` in a `webhook_events` table (unique); reject seen refs and `created_at` older than ~15 min. | Med |
| **R-16** | Architecture | `features/admin/**` (20 pages), `app/admin/change-requests/page.tsx:81` | Admin layer calls `getAdminSupabase()` directly — no repository boundary. `orderSelect` column string duplicated in ≥4 places; one page recomputes order totals in the render path. | Introduce `features/admin/repositories/`; move `applyChanges` into a server function the page renders. | Large |
| **R-17** | Architecture | `features/order` vs `features/orders`; `checkout ↔ order` & `catalog ↔ gift-finder` import cycles | `order`/`orders` split is semantically meaningless; two real mutual import cycles exist (verified via dependency graph). | Rename `features/orders` → `features/order-mutations`; move `GIFT_COLORS` to `catalog/color-tags.ts`; `CheckoutForm` calls `getOrderRepository()` not a direct repo import. | Med |
| **R-18** | Architecture / Data | `products.category` (text, no FK) vs `categories` table | Taxonomy split: admin can add a category no product uses; a product can carry a category absent from the table → filter "search bugs". | Backfill `products.category_id uuid references categories(id)`; switch filter to FK. | Med |
| **R-19** | Architecture / Data | `order_items.product_id` always `NULL` (`035:133`, `024:80`) | FK column never written; review purchase-verification falls back to `product_slug` (breaks on slug rename). | Resolve `product_id` in `authoritativeLines` and pass it; backfill historical rows. | Quick |
| **R-20** | Performance / Architecture | `lib/rate-limit.ts:8-14` (memory fallback) | `prune()` scans the **entire** `Map` on every request; attacker-controlled keys → unbounded memory/CPU; O(n) per request. | Bounded `Map` (evict oldest past N); sweep lazily (every 60s), not per call. | Quick |
| **R-21** | Performance | `supabase/migrations/*` | Missing indexes on `product_variants(product_id)`, `payments(order_id)`, `product_reviews(product_id,status,created_at)`, `products(category)`, `products(price_minor)` → seq scans on every catalog/PDP read. | One additive migration with `CREATE INDEX CONCURRENTLY IF NOT EXISTS` for the 5 columns. | Quick |
| **R-22** | Code Quality | `features/subscriptions/*`, `features/personalization/*` (36 `as any`/`as unknown as` total) | Type-safety epidemic: `client as any` everywhere in subscriptions because the generic `Client` type loses column typing. DB results untyped. | Thread a typed Supabase client; replace `as any` with real row types (use generated types from the schema). | Med |
| **R-23** | Code Quality | 18 `.catch(() => …)` + 2 empty `catch {}` (`account/(dashboard)/page.tsx:42`, `TurnstileWidget.tsx:87`) | Swallowed errors hide DB/transport failures; the dashboard silently defaults `reduce_motion` on any error. | Log + surface; only swallow in genuine cleanup (TurnstileWidget is acceptable). Never swallow DB reads silently. | Quick |
| **R-24** | Code Quality / i18n | `features/subscriptions/SubscriptionCheckoutForm.tsx`, `AdminPlanForm.tsx`, several `ui/*` | Hardcoded English labels ("Phone","Address","Window","Promo code","Slug","Frequencies","Close","Previous") bypass `t()`. The i18n-parity test checks *key* parity, not *usage*, so these slip CI. ar/fr users see English. | Route labels through `t()`; extend the dictionary test to flag JSX text nodes not wrapped in `t()`. | Med |
| **R-25** | Maintainability | `features/checkout/CheckoutForm.tsx` (614 lines) | God component: data fetching + form state + pricing + payment orchestration + 3 promo types in one file. | Split into `CheckoutForm` (state) + `PriceSummary` + `PaymentStep` + a `useCheckout` hook; move pricing to `computeOrderTotals`. | Med |
| **R-26** | Maintainability / Docs | `README.md`, `docs/` (87 md) | No documented deploy/rollback procedure, no staging/preview, no note that the **Workers constraint forbids `middleware.ts`** and raw sockets, no ADR log. (Note: CI *does* run E2E — prior "E2E excluded" note is stale.) | Add `docs/DEPLOY.md` (apply migrations → `cf:deploy` → verify; rollback = previous deploy + `wrangler rollback`); document the Workers constraints; add an ADR for the no-middleware decision. | Med |

### Tier 3 — LOW IMPACT

| ID | Dim | Area | Issue | Fix | Effort |
|----|-----|-------|-------|-----|--------|
| **R-27** | Security | `app/admin/layout.tsx` | Layout renders `AdminShell` for anyone; every page individually guards, but one future omission = open admin. | Add `getCurrentAdmin()` guard to the layout; share `requireAdminPage()`. | Quick |
| **R-28** | Architecture / Runtime | `features/gift-cards/crypto.ts` (`createCipheriv`/`createDecipheriv`) | Symmetric ciphers are the least-certain part of the `nodejs_compat` crypto shim; could fail only in prod. | Deploy a throwaway Worker round-trip to a preview env; if unsupported, migrate to WebCrypto `AES-GCM`. | Quick (verify) |
| **R-29** | Performance | `components/admin/*` (only 1 `next/dynamic` in repo) | Heavy `*Form` dialogs + `AppSidebar` (radix `Slot`/`Sheet`/`Tooltip`) load on every admin route. | `next/dynamic({ssr:false})` the forms; lazy-mount the mobile `Sheet`. | Med |
| **R-30** | Performance | `features/catalog/CatalogGrid.tsx`, `ProductCard.tsx`, `ProductVisual.tsx` | Grid is fully client-hydrated only to read `useI18n`/`useStorePath`; `sizes` defaults to `100vw`. | Make grid/card server components; keep `WishlistHeart` as the client island; pass `sizes="(…)33vw"`. | Med |
| **R-31** | Performance | `features/money.ts:8`, `translate.ts:120` | `Intl.NumberFormat`/`Intl.*` allocated per call (30–100/render on catalog). | Module-level memoized `Map<locale+currency, Intl.NumberFormat>`. | Quick |
| **R-32** | Code Quality / Tests | `features/catalog/local-repository.ts` (demo path) | 254 tests heavily exercise the demo/no-Supabase search & repository fakes → **production Supabase pricing/RPC paths are under-tested**. A pricing bug would not be caught. | Add integration tests against a migrated scratch DB for `create_pending_order`, promo, and delivery-fee; cover all 3 promo types. | Med |

---

## 4. Quick Wins (minimal effort, meaningful value)

| ID | Fix | Why it's worth it | Effort |
|----|-----|-------------------|--------|
| R-01 | Server-recompute subscription discount | Stops free-subscription theft (High impact) | <1h |
| R-02 | Apply migrations 038–040 | Closes promo read, enables subscription RLS, fixes inventory cron | <1h (apply) |
| R-05 | Pin `timeZone: 'Africa/Cairo'` in date formatters | Fixes every customer-facing time (High impact) | <1h |
| R-06 (consts) | Delete scattered delivery-fee literals; one helper | Stops systematic undercharge | <1h |
| R-07 (CartSync/zod) | Dynamic-import browser client; move occasion constants out of `validation.ts` | −130 KiB gz client JS, no product change | <1h |
| R-10 | `order_items.product_id` backfill | Repairs review verification join path | <1h |
| R-19/R-20 | Bound the memory rate-limit `Map`; sweep lazily | Removes a CPU/memory-exhaustion vector | <1h |
| R-21 | Add 5 missing DB indexes | Kills seq scans on hot catalog/order reads | <1h |
| R-27 | Add `getCurrentAdmin()` to `app/admin/layout.tsx` | Closes the latent open-admin gap | <1h |
| R-31 | Memoize `Intl` formatters | Removes per-render allocations on the heaviest page | <1h |
| R-28 | Verify `node:crypto` ciphers on a preview Worker | De-risks gift-card go-live | <1h |

---

## 5. Dimension Roll-up

**Security — strongest and weakest.** Strong: RLS design, Paymob HMAC (constant-time, query-param preferred), cron auth (`timingSafeEqual` + per-job secret), review-photo magic-byte checks, CSP, sanitizer (no `dangerouslySetInnerHTML` bypasses found). Weak: client-trusted money (R-01), unapplied RLS migration (R-02), fail-open controls (R-04), service-role-everywhere (R-09, X2).

**Performance — bundle + caching dominate.** Worker is 2.5 MiB gz (over the 1 MiB free limit). ~208 KiB gz + ~110 KiB polyfills are removable import-graph fixes (R-07). The bigger structural issue is the **absence of any cache layer** (R-08) — static catalog that re-queries every request. Verified optimal: admin dashboard RPC, `AccountNavItem` dynamic import, catalog FTS GIN index, `next/font` usage.

**Architecture — pricing is the rot.** The Postgres-RPC convention is real but abandoned exactly where it matters most (money). Five delivery-fee sources of truth (R-06), a dumb `create_pending_order` (ARCH-2), two discount code paths that disagree (ARCH-3), and an unenforced subscription/payment state machine (R-11). **Deployment reproducibility is broken** (R-10) and the inventory cron is silently failing on live (R-02/R-08-arch). Verified sound: fulfillment state machine is centralized and enforced; integer minor-units everywhere; `wait-until`/`cron` are Workers-correct; no feature-level circular imports beyond the two found.

**Code Quality — timezone + typing + swallowed errors.** Highest-value: the UTC-vs-Cairo timezone bug (R-05) and the `as any` typing epidemic concentrated in `features/subscriptions/*` (R-22). 18 swallowed promises + 2 empty catches (R-23). i18n labels hardcoded in the subscription/admin forms (R-24). Test suite is large but over-exercises the demo path (R-32).

**Maintainability — two mailers, one god component, thin docs.** `nodemailer` + `resend` coexist (R-03); `CheckoutForm.tsx` is 614 lines (R-25); no deploy/rollback runbook and no recorded Workers constraints (R-26). Convention adherence is good for ~6 modules, weak for `features/admin` (flat 15-file grab-bag) and 5 near-empty modules. CI is solid (tsc + eslint + unit + E2E + `npm audit` + worker-size gate that `process.exit(1)` on overflow).

---

## 6. Suggested Sequencing

1. **Now (correctness/money/security):** R-01, R-02, R-05, R-06 (consts), R-04, R-27.
2. **This week (deploy-breaking + data):** R-03 (mailer), R-08-arch inventory cron, R-10 (schema drift), R-09.
3. **This sprint (structural):** R-06 (invariant) + pricing kernel, R-07, R-08, R-11, R-13.
4. **Backlog:** R-12, R-16, R-17, R-18, R-22, R-24, R-25, R-26, R-32, plus Tier-3 items.

---

*Generated from direct source reading and three independent sub-agent audits. All file paths and line references were verified against the working tree at commit `14f987e`.*
