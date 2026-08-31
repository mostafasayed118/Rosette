# Codebase Review — Implementation Status

Review source: `docs/CODEBASE_REVIEW_2026-09-01.md` (32 recommendations, R-01…R-32).
Status: **30 of 32 implemented & verified. 2 remaining (documented, lower priority).**

## Verification gate (this session)
- `npx tsc --noEmit` → **clean (0 errors)**.
- `npx vitest run` → **248 files, 1329 tests passing**.

## What was completed in this continuation

### Blocking fixes (unblocked CI)
- **Promo type errors (pre-existing):** `PromoInput` required `perUserLimit` and added `'free_shipping'`; the admin forms/test never caught up. Fixed:
  - `components/admin/PromoForm.tsx` (broadened `useState` generic, added `perUserLimit`, added `Free shipping` option)
  - `components/admin/AddPromoForm.tsx` (added `perUserLimit`)
  - `app/admin/promos/page.tsx` (`PromoRow` + promo object updated)
  - `tests/domain/promo-actions.test.ts` (added `perUserLimit`)
- **`shop-personalization.test.tsx` (broken by R-08 caching):** `PersonalizationSection` is now an async server component inside `<Suspense>` and `listCatalogCategories` uses `unstable_cache`. Switched the test from synchronous `renderToString` to streaming `renderToPipeableStream` + `PassThrough`, and mocked `next/cache` so `unstable_cache` runs without the Next runtime. 8/8 pass.

### Remaining LOW-tier recommendations (implemented)
- **R-17 — rename `features/orders` → `features/order-mutations`** (was `git mv` + 15 import sites updated across app/api, app/admin, app/[locale], tests). Skipped the `GIFT_COLORS` move sub-point: it already lives in `features/gift-finder/tags.ts` and moving it is pure churn. `CheckoutForm` already uses `features/order` (`createLocalOrder`), so that sub-point was already satisfied.
- **Drop `nodemailer`** from `package.json` (zero source imports after R-03; lockfile resynced via `npm install`).
- **R-32 — pricing integration tests:** `tests/domain/pricing-pipeline.test.ts` (17 tests) covering money invariants, promo pipeline (percent/fixed/free_shipping), real delivery-fee constants from `delivery-rules.ts`, subscription discount, and end-to-end total reconciliation.
- **R-28 — gift-card crypto verification:** `tests/domain/gift-card-crypto.test.ts` (5 tests). Verdict: `aes-256-gcm` + HMAC-SHA256, all primitives polyfilled by `nodejs_compat` → **no Workers-incompatible API**. Residual notes (out of scope): the encryption secret must be provisioned as a Workers secret at the call site; HMAC comparisons elsewhere are not constant-time.
- **R-18 — `products.category_id` FK:** `supabase/migrations/048_product_category_fk.sql` — adds `category_id uuid`, backfills from `products.category → categories.slug`, FK to `categories(id)` (`ON DELETE SET NULL`), idempotent.
- **R-29 — lazy admin forms:** 4 `'use client'` wrappers (`ProductFormClient`, `BlogFormClient`, `PromoFormClient`, `DeliveryRuleFormClient`) using `next/dynamic({ ssr:false })`; 4 server admin pages updated. Server pages kept as Server Components (wrapper pattern, not `'use client'`).

### Regression fixed during verification
- **`notification-admin.test.ts`** was broken by R-12 (impl moved filtering/pagination to SQL RPCs but the test still mocked the old `from()` client). Rewrote the test to assert the RPC is invoked with correct params (`p_q/p_status/p_type/p_page_size/p_page_offset`) and that rows are mapped. 8/8 pass.

## Remaining (documented, not done)
- **R-16 (Architecture, Large):** Admin layer calls `getAdminSupabase()` directly with no repository boundary; `orderSelect` column string duplicated in ≥4 places. Recommendation: introduce `features/admin/repositories/` and move `applyChanges` into a server function. Left as backlog — large blast radius across ~20 admin pages; needs a dedicated, carefully-scoped pass.
- **R-30 (Performance, Med):** Make `CatalogGrid`/`ProductCard` server components, keep `WishlistHeart` as the client island, pass `sizes="(…)33vw"`. Left as backlog — changes the rendering model and must verify `useI18n`/`useStorePath` usage can move server-side without breaking client interactivity.

## Operational follow-up — migrations **APPLIED** (2026-08-31)

Migrations **038–040** (from the original review) and **044–048** (this work) were applied to the live Supabase project (`vwjqtwxqangblapnmtbm`) by the user via:

```
supabase link --project-ref vwjqtwxqangblapnmtbm
supabase db push --dry-run   # listed 038–048 as "Would push"
supabase db push             # applied all 11 (Exit 0)
supabase migration list      # confirmed 038–048 populated in the remote column
```

- 038/039/040 — dashboard RPCs, RLS, delivery/catalog refinements (original review)
- 044 — order total invariant `chk_order_totals` + `product_id` backfill
- 045 — `admin_notification_deliveries` / `admin_notification_deliveries_count` RPCs
- 046 — `webhook_events` replay protection
- 047 — missing indexes
- 048 — `products.category_id` FK → `categories(id)` (`fk_product_category`)

**Non-fatal warning on push (safe to ignore):**
```
Warning: failed to cache migrations catalog: error exporting pg-delta catalog:
edge-runtime script produced no output: ... Failed to read certificate file
'/workspace/supabase/.temp/pgdelta/pgdelta-target-ca.crt': ENOENT
```
This concerns only the Supabase CLI's new **pg-delta catalog-cache optimization** (it failed to write its edge-runtime cert file). It does **not** affect the migrations themselves — all 11 applied and `migration list` reflects them. To silence it, upgrade the CLI (`v2.109.1` → `v2.116.0+`).

**Recommended post-push validation (live / staging):**
1. Smoke-test the new admin notification RPCs (`admin_notification_deliveries` / `_count`).
2. Confirm `webhook_events` replay protection blocks duplicate Paymob webhooks.
3. Verify RLS from 038/040 on a non-admin role.
4. Confirm `products.category_id` backfill populated and the FK holds.
5. Run a preview Worker deploy and exercise catalog + admin flows end-to-end.
