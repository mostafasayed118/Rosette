# Audit-Remediation Completion — R-16 & R-30

## What was actually wrong
The referenced status doc claimed R-16/R-30 were "left as backlog" and the build was
"clean, 1329 tests passing." That described the **pre-WIP baseline**. In reality the
`audit-remediation` branch carried **uncommitted WIP that broke the typecheck** and
left both features half-wired.

## R-30 — catalog server components (completed)
- `ProductCard` + `CatalogGrid` are now server components; they take `locale` + `href`
  as props instead of `useI18n`/`useStorePath`.
- **Fixed a server→client boundary violation:** the shop pages passed a `href` *function*
  from the server `PersonalizationSection` into the **client** carousels
  (`RecommendedCarousel`/`BuyAgainStrip`). Functions cannot cross the RSC boundary. The
  client components now derive `href`/`locale` from their own `useStorePath()`/`useI18n()`
  hooks; props stay optional so existing tests still pass.
- `store-path.ts` is the shared pure path builder; the guard test in
  `tests/components/CatalogGrid.test.tsx` fails loudly if a client-only hook re-enters
  those files.

## R-16 — admin repository boundary (established + tested; full migration deferred)
- `features/admin/repositories/` (16 files) is the data-access boundary; `client.ts` is
  the single `getAdminSupabase()` entry point. Order list, order detail, and dashboard
  pages now read only through it; `orderSelect` is centralized in `order-select.ts`.
- **Two product bugs fixed:**
  1. `orders/[id]/page.tsx` read `delivery.last_error` while the repo maps to `lastError`.
  2. `cancel-requests.ts` `mapRow` coerced every non-`rejected` status (incl. `pending`)
     to `approved`, which would have hidden the cancel-review UI. Now preserves
     `'pending' | 'approved' | 'rejected'`.
- `tests/domain/admin-repositories.test.ts` (new) verifies the row→domain mapping for all
  four repos, including both fixes above.
- ~80 remaining admin pages/API routes still call `getAdminSupabase()` directly — the
  large-blast-radius migration the original audit explicitly scoped out. The boundary
  exists and is the recommended pattern.

## Verification
- `npx tsc --noEmit` → **0 errors**.
- `vitest run` → **249 files, 1339 tests passing** (10 added this pass).
- ESLint → **clean** on every file touched.
- Working tree is **uncommitted** on `audit-remediation` atop the `68fb551` checkpoint.

## Recommended next step
Run a preview Cloudflare Worker deploy and exercise catalog + admin flows end-to-end
(per the original doc's post-push validation list) before merging.
