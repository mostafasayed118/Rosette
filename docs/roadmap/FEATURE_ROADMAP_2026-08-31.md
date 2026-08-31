# Rosette — Next Feature Roadmap

**Date:** 2026-08-31
**Scope:** Gap analysis of the existing implementation, with a prioritized list of *new* features.
**Assumption:** everything already shipped works and needs no fixes. This document only proposes additions.

---

## 1. What exists today (audit basis)

The codebase is substantially complete. 31 feature modules, ~60 API routes, 39 migrations / 37 tables, 244 test files (~1,280 cases), trilingual dictionaries at 779 keys with enforced parity, and a repeatable feature shape (migration → repository → feature module → UI → i18n ×3 → tests).

Already covered end to end:

| Area | State |
|---|---|
| Browse → cart → checkout → order → tracking | Complete, including guest checkout and guest tracking |
| Payments | Paymob + cash on delivery, HMAC-verified webhook, idempotent, full + partial refunds |
| Order lifecycle | Statuses with legal transitions, order events, cancel + change requests with delta payment/refund |
| Subscriptions | Plans, purchase, pause/resume/skip/reschedule, prepaid-bundle materialization, cancel-to-store-credit |
| Gift cards | Purchase, issue/hold/redeem/refund/void ledger, expiry, admin tooling |
| Wishlist | Add/remove, price-drop + back-in-stock cron, merge on login |
| Reviews | Submit, photos, helpfulness votes, verified-purchase badge, moderation queue |
| Retention automation | Abandoned cart, occasion reminders, subscription renewal nudge |
| Admin | Orders, products, inventory, promos, blog, authors, subscriptions, gift cards, delivery rules, reviews, requests |
| Platform | i18n ×3 with RTL, structured logging, rate limiting, Turnstile, CSP, contrast gate, CI on PRs |

The gaps below are therefore *extensions of a working system*, not repairs.

---

## 2. Constraints that shape every recommendation

These are load-bearing — they determine which proposals are realistic.

1. **Cloudflare Workers runtime, not Node.** Sentry was added and then removed **twice** (`7644dd8`, `344c2f3`) because its dynamic `fs` require crashes `workerd` and it pushed the bundle over the free limit. Any proposal requiring a Node-only SDK, native module, or filesystem access is a non-starter.
2. **Bundle budget is already tight.** The Worker measures ~2.5 MiB gzip — over the 1 MiB Free limit, under the 10 MiB Paid limit. Prefer server-side work, SQL, and platform primitives over new client dependencies.
3. **i18n parity is enforced by test.** Any user-facing string must be added to `en`, `ar`, and `fr` or `tests/domain/i18n-dictionary.test.ts` fails. Budget for this on every feature.
4. **Deployment is currently degraded.** `wrangler.jsonc` sets `PAYMENT_MODE=cod` and `EMAIL_DELIVERY_MODE=disabled`, and runs on `workers_dev` with no custom domain, staging, or preview environment. Migrations 038–040 are not yet applied to the live Supabase project, and Upstash/Turnstile production secrets are unconfigured. Sequencing growth features on top of this is fine; sequencing *measurement* features on top of it is not — see Wave 3.
5. **Some capabilities exist but are wired to nothing.** Three confirmed cases:
   - `CatalogRepository.isDeliverable()` — implemented in both repositories, **zero callers**. Friday-closed and same-day-cutoff rules are silently dead.
   - `categories` table — migrations and RLS maintained, **never read**; categories are hardcoded in `features/catalog/data.ts`.
   - `inventory_reservations` — SQL-only, no application code.
   - `admin_audit_logs` — written from 15 call sites, **no read path**.

   Several "new features" below are really *activation* of work already paid for. Those are the best value on this list.

---

## 3. Must-have features (core to the product)

Ranked by value ÷ effort. Effort is engineer-days for someone familiar with the codebase.

### M1 — Enforce delivery eligibility on the storefront
**Effort:** 3–4 days · **Dependencies:** `isDeliverable` (done), `delivery_rules`, PDP date picker
**Changes existing behavior: YES — highest-risk item on this list.**

Wire the existing `isDeliverable()` into the PDP date picker and checkout date validation. Today the storefront accepts any date, including Fridays, and the fee/reason strings it returns are never shown.

Adds: disabled dates in the picker, a fee + reason line ("Our studio rests on Fridays", "Same-day before 2pm"), and server-side rejection in `validateOrderRequest`.

*User problem:* customers can currently book a delivery the studio cannot honour — a promise failure, not a cosmetic bug.

*Risk:* this will newly reject dates that are accepted today. Ship behind a data check (confirm `delivery_rules` is populated for all 10 cities) and keep the client and server validations in one shared function so they cannot drift.

### M2 — Product quantity selector + stock visibility on the PDP
**Effort:** 1–2 days · **Dependencies:** `ProductDetail.tsx`, cart line model
**Changes existing behavior: minor.**

`quantity: 1` is hardcoded at `features/product/ProductDetail.tsx:51`. The cart already supports changing quantity (`updateQuantity`), so the data model is ready — only the entry point is missing. Also surface the stock state that is already computed in `features/catalog/row-mappers.ts` but never rendered.

*User problem:* buying two bouquets requires finding the cart editor; customers assume one is the maximum.

### M3 — Storefront availability and low-stock signals
**Effort:** 2–3 days · **Dependencies:** `inventory`, `product_variants`, admin low-stock query
**Changes existing behavior: no (additive).**

Low-stock warnings exist for admins only (`features/admin/dashboard-stats.ts`). Add storefront "only N left" badges, a sold-out state that disables add-to-cart, and a back-in-stock notify prompt reusing the wishlist price-watch infrastructure.

*User problem:* customers discover sell-outs late in the funnel.

### M4 — Product search: relevance, tolerance, and as-you-type
**Effort:** 4–6 days · **Dependencies:** `supabase-repository.ts` search branch
**Changes existing behavior: no (replaces an implementation, not a contract).**

Search today is `ILIKE` across five columns with no ranking, no typo tolerance, and no Arabic normalization. The Fuse.js fuzzy search that *would* help (`features/catalog/fuse-search.ts`) only runs on the local/demo repository path — in production it is dead code.

Add a Postgres `tsvector` generated column with `websearch_to_tsquery` + `ts_rank`, keep `ILIKE` as fallback, and add an as-you-type results dropdown. Handle Arabic without stemming (light normalization only); keep the existing `or()` branch as the fallback so this is safe to ship incrementally.

*User problem:* with a catalog that grows, exact-substring search fails on typos, synonyms, and inflected Arabic — the main discovery path degrades.

### M5 — Promo codes: free-shipping type and per-user limits
**Effort:** 3–4 days · **Dependencies:** `promo_codes`, `008_promos.sql`, `features/promo/apply.ts`
**Changes existing behavior: YES (schema + discount math).**

The check constraint allows only `'percent' | 'fixed'`. Free shipping — the single most common delivery promotion — is not representable, and there is no per-user redemption limit or stacking (one `promo_code` column per order).

Requires a migration widening the constraint, a `promo_redemptions` table for per-user counting, and discount math that can zero the delivery fee rather than the subtotal. Note that `038_audit_remediation.sql` already hardened `increment_promo_usage` for per-user limits that do not exist yet — the schema is waiting for this.

*User problem:* merchandising cannot run the promotions the business actually needs.

### M6 — Order receipt / invoice
**Effort:** 3–5 days · **Dependencies:** order + payment data, i18n, notification templates
**Changes existing behavior: no (additive).**

Nothing in the codebase produces an invoice or receipt artifact. Add a printable/HTML invoice route per order (token-gated like `/orders/[id]`), attach a PDF or a link in the confirmation email, and expose download in account order history.

Keep PDF generation server-side and dependency-light given the bundle budget; an HTML invoice styled for print may be the better first increment.

*User problem:* customers and the business have no proof-of-purchase document — a baseline expectation for any order.

### M7 — Reorder from order history
**Effort:** 3–4 days · **Dependencies:** cart model, product availability, `BuyAgainStrip`
**Changes existing behavior: no (additive).**

`BuyAgainStrip` recommends products but there is no one-click reorder. Add a reorder action that rehydrates cart lines (variant, add-ons, gift note, recipient) and gracefully handles products that changed or went out of stock.

*User problem:* repeat gifting is the core revenue loop for flowers, and it currently has no fast path.

### M8 — Product analytics and funnel instrumentation
**Effort:** 4–5 days · **Dependencies:** none, but see risk
**Changes existing behavior: no (additive).**

There is no product analytics — only the Cloudflare Web Analytics pageview beacon. There are no funnel events, so conversion, drop-off, and search effectiveness are unmeasurable.

Use **Cloudflare Workers Analytics Engine** (a binding, no client SDK, no bundle cost) or a lightweight server-side event collector hitting your own route. Explicitly avoid a browser analytics SDK — see §5.

Minimum event set: product view, add-to-cart, checkout start, checkout step completed, order placed, search performed (with zero-result flag).

*User problem:* every subsequent growth investment would otherwise be unmeasurable.

---

## 4. Nice-to-haves (valuable, not core)

Ordered loosely by value ÷ effort.

| # | Feature | Effort | Deps | Changes behavior? |
|---|---|---|---|---|
| N1 | **Admin audit-log viewer** — 15 write sites, zero reads; the trail is invisible today | 1–2 d | `admin_audit_logs` | No |
| N2 | **Recently viewed products** — `features/personalization/analytics.ts` is a no-op stub | 1–2 d | personalization | No |
| N3 | **Wishlist sharing** via public link | 1–2 d | `wishlist_items` | No |
| N4 | **Occasion reminder snooze/dismiss** | 1 d | `occasion_reminders` | No |
| N5 | **Merchant replies to reviews** | 1 d | `product_reviews` | No |
| N6 | **Global OG + Twitter cards, sitemap hreflang alternates** — OG exists only on PDPs; no `twitter:`, no `metadataBase` | 1–2 d | `features/seo/*` | No |
| N7 | **E2E in CI** — 5 E2E files exist but are excluded from `pr-checks.yml` | 1 d | Playwright | No |
| N8 | **Gift card scheduled delivery + public balance check** | 3–4 d | gift cards | No |
| N9 | **Multi-image product gallery with zoom** — single `image_url` today | 3–4 d | products | No |
| N10 | **Subscription plan change (upgrade/downgrade)** | 4–5 d | subscriptions | Yes — proration rules |
| N11 | **Admin reporting** — date ranges, charts, CSV export, bulk actions, staff-roles UI | 3–5 d | `039_dashboard_rpc.sql` | No |
| N12 | **Category taxonomy from DB** — activates the dead `categories` table | 3–4 d | catalog | **Yes** — changes filter URLs |
| N13 | **PWA manifest + service worker** | 2–3 d | none | No |
| N14 | **Feature flags / kill switches** — only env-driven modes today | 3–4 d | `lib/runtime-config.ts` | No |
| N15 | **Staging env, preview deploys, rollback runbook, DB backups** | 1–2 w | infra | No |
| N16 | **Support ticket inbox + chat-to-human handoff** | 1–2 w | chat, admin | No |
| N17 | **Loyalty / rewards / referral program** — completely absent, no schema | 2–3 w | orders, auth | No |

---

## 5. Explicitly not recommended

Recording these so they are not re-litigated.

- **Sentry (or any Node-observability SDK).** Added and removed twice. It crashes `workerd` via a dynamic `fs` require and pushed the bundle past the free limit. Use Workers observability + the existing structured logger (`lib/logger.ts`) instead.
- **Client-side analytics SDKs (PostHog/GA4/Segment).** Bundle budget is already at ~2.5 MiB gzip. Server-side collection only.
- **Native mobile app (React Native / Expo).** No existing native surface, no `app.json`, and no evidence of demand. The responsive storefront plus a PWA (N13) covers the need at a fraction of the cost.
- **Saved payment methods / card vaulting.** Paymob is hosted-checkout only; vaulting pulls you into PCI scope. Revisit only if Paymob offers tokenization you can reference without storing PANs.
- **Dunning for subscriptions.** Subscriptions are *prepaid bundles*, not recurring charges — there is nothing to retry. Real dunning would require moving to recurring billing, which is an architectural change, not a feature.
- **Framework or datastore migration.** The Supabase + Next.js + Workers stack is coherent and the migration discipline is good. No reason to change it.

---

## 6. Suggested implementation order

Sequenced so that correctness comes before conversion, and **measurement comes before growth investment**.

**Wave 1 — Trust and truth (≈1–1.5 weeks)**
1. M1 delivery eligibility *(do first: it is the only item that can currently make a false promise)*
2. M2 quantity + stock display
3. M3 availability signals

All three are storefront-truth features that reuse existing data. M1 needs the most care.

**Wave 2 — Discovery and merchandising (≈1.5 weeks)**
4. M4 search
5. M5 promo completeness
6. N6 OG/hreflang *(cheap, parallelizable)*

**Wave 3 — Measurement (≈1 week)**
7. M8 product analytics
8. N7 E2E in CI
9. N1 audit-log viewer

**Do not start Wave 5 before this wave lands.** Loyalty and admin reporting cannot be evaluated without funnel data.

**Wave 4 — Repeat purchase (≈2 weeks)**
10. M7 reorder
11. M6 invoice
12. N2 recently viewed · N3 wishlist sharing

**Wave 5 — Growth and depth (ongoing, pick by appetite)**
13. N17 loyalty *(largest single lever, also largest cost — decide with Wave 3 data)*
14. N10 subscription plan change
15. N11 admin reporting
16. N8 gift-card scheduling · N9 gallery · N13 PWA
17. N15 staging/backups *(do this whenever the project moves off `workers_dev` to a real domain)*

---

## 7. Cross-cutting reminders for whoever implements these

- **Every feature touches three dictionaries.** Add `en`/`ar`/`fr` keys together; parity is enforced in CI.
- **Prefer SQL over JS.** The project already pushes filtering, sorting, pagination, and aggregation into Postgres and an RPC (`039_dashboard_rpc.sql`). Follow that pattern.
- **Server components by default.** Interactive work belongs in isolated `"use client"` leaf components.
- **Check the bundle after every dependency.** `npm run cf:build` gates worker size.
- **Tests are cheap here.** 244 files and a mature `renderWithProviders` harness mean new features should ship with domain + component tests as a matter of course.
- **New migrations follow the numbered convention** in `supabase/migrations/` and are validated by the existing migration tests.
