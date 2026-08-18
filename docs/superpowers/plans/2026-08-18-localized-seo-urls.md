# Plan — Localized SEO URLs + sitemap + product metadata

Spec: `docs/superpowers/specs/2026-08-18-localized-seo-urls.md`

Two phases, executed test-first in an isolated worktree. Each phase ends green
(tests + `tsc` + production build) before the next begins.

---

## Phase A — route restructure

### A1. Middleware

- Create `middleware.ts` (matcher skips `api`, `admin`, `login`, `_next`, and
  file paths).
  - `/` → redirect `/en`.
  - First segment not in `['en','ar','fr']` → redirect to the `en` path.
  - Set `rosette.locale` cookie from the URL segment via
    `request.cookies.set(...)` + `NextResponse.next({ request })`.
- Tests: new `tests/lib/middleware.test.ts` — root redirect, invalid locale
  redirect, valid locale sets cookie, `admin`/`api`/`login` left untouched.

### A2. Route move

- Move storefront pages under `app/[locale]/[city]/`:
  - `app/page.tsx` → `app/[locale]/[city]/page.tsx` (home; reads `params`).
  - `app/shop/**` → `app/[locale]/[city]/shop/**`.
  - `app/cart` → `app/[locale]/[city]/cart`.
  - `app/checkout` → `app/[locale]/[city]/checkout`.
  - `app/orders/[id]` → `app/[locale]/[city]/orders/[id]`.
  - `app/track` → `app/[locale]/[city]/track`.
  - `app/account/**` → `app/[locale]/[city]/account/**`.
- New `app/[locale]/layout.tsx` (validate locale, `notFound()` on unknown).
- New `app/[locale]/page.tsx` — city picker (moves `DestinationGate` here);
  selecting a city navigates to `/[locale]/[city]`.
- New `app/[locale]/[city]/layout.tsx` (validate city, redirect to `/[locale]`
  when unknown; renders the shared storefront shell if not already per-page).
- Root `app/page.tsx` → `redirect('/en')` (or removed in favor of middleware).
- `getServerT()`/`I18nProvider` unchanged (locale still cookie-read; middleware
  keeps the cookie in sync with the URL).

### A3. City threading (URL instead of localStorage)

- `CartPageContent` — accept `cityCode` prop; drop `readDestination()`.
- `CheckoutForm` — accept `cityCode` prop; drop `readDestination()`.
- `DestinationGate` — become the `[locale]` city picker; navigate to
  `/[locale]/[city]` on select (no `writeDestination`).
- `app/[locale]/[city]/page.tsx` — read `params.city`, no longer uses
  `readDestination()`/`clearDestination()`.
- Remove `writeDestination`/`clearDestination` usages from the storefront;
  keep `storage.ts` only if something still needs it (plan removes it if not).

### A4. Link generation

- New `features/i18n/use-store-path.ts` (client): `useStorePath()` →
  `{ locale, cityCode, href(path) }` from `useParams()`.
- Update internal links to carry `/{locale}/{city}`:
  - `SiteHeader` (logo `/`, `/shop`, `/cart`, `/track`) + language toggle →
    navigate same path under another locale.
  - `AccountShell` (`/account`, `/account/orders`).
  - `CatalogGrid` / product card → `/shop/[slug]`.
  - `ProductDetail` → cart/checkout links.
  - `CartPageContent` → checkout link.
  - checkout → `/orders/[id]` success link.
  - product page breadcrumb + `backCollection` links.

### A5. Test repair + gate

- Update component/page tests that render pages using `useParams()`/routing to
  provide `locale`/`city` params (mock `next/navigation` where needed).
- Run `npm test`, `npm run lint` (tsc), `npm run build`. All green.

---

## Phase B — SEO surface

### B1. robots + sitemap

- `app/robots.ts` — allow all, `sitemap: '<base>/sitemap.xml'`.
- `app/sitemap.ts` — enumerate:
  - `/{locale}/{city}` and `/{locale}/{city}/shop` for every locale+city,
  - `/{locale}/{city}/shop/[slug]` for every locale+city+product,
  - base from `SITE_URL` (strip trailing slash; documented fallback).
- Tests: `tests/domain/sitemap.test.ts` (extract the URL builder into a pure
  `buildSitemapEntries({ base, locales, cities, products })` helper and assert
  counts + sample URLs).

### B2. Product generateMetadata

- `app/[locale]/[city]/shop/[slug]/page.tsx` — `generateMetadata({ params })`:
  - title/description from localized fields,
  - `alternates.canonical` + `alternates.languages` (`{ en, ar, fr }`),
  - `openGraph` (title, description, image when present).
- Pure helper `features/seo/product-metadata.ts` — `buildProductMetadata(...)`
  so it is unit-testable.
- Tests: `tests/domain/product-metadata.test.ts` — localized title, hreflang
  map, canonical, og image presence/absence.

### B3. JSON-LD Product schema

- New `components/seo/ProductJsonLd.tsx` (server) — renders
  `<script type="application/ld+json">` with name/description/image/offers
  (EGP, price). Rendered in the product page.
- Test: JSON shape (parse the serialized string in a unit test).

### B4. Gate + merge

- Full suite, tsc, build; discard `next-env.d.ts` churn; `git diff --check`.
- Merge feature branch to `master`, push, clean worktree.
