# Localized SEO URLs + sitemap + product metadata

## Goal

Move the storefront onto Flowrista-style localized URLs (`/en/cairo`,
`/ar/cairo`, …), and add the SEO surface that makes those URLs crawlable and
rankable: `sitemap.xml`, `robots.txt`, per-product `generateMetadata` with
canonical + hreflang, and JSON-LD `Product` structured data.

## Current state

- Locale is **cookie-based** (`rosette.locale`, default `en`); resolved by
  `getServerT()` (server) and `I18nProvider` (client).
- Destination/city is **localStorage-based** (`rosette.destination.v1`),
  read by `readDestination()` in `CartPageContent`, `CheckoutForm`,
  `DestinationGate`, and `app/page.tsx`.
- No `middleware.ts`, no `app/sitemap.ts`, no `app/robots.ts`.
- `app/shop/[slug]/page.tsx` has no `generateMetadata` and no JSON-LD.
- Customer routes live at the root: `/`, `/shop`, `/shop/[slug]`, `/cart`,
  `/checkout`, `/orders/[id]`, `/track`, `/account/**`.

## Target URL map

| URL | Content |
| --- | --- |
| `/` | redirect → `/en` |
| `/[locale]` | city picker (locale-scoped landing) |
| `/[locale]/[city]` | storefront home (today's `/` content) |
| `/[locale]/[city]/shop` | catalog |
| `/[locale]/[city]/shop/[slug]` | product detail |
| `/[locale]/[city]/cart` / `checkout` / `orders/[id]` / `track` | transactional |
| `/[locale]/[city]/account/**` | customer account |
| `/login`, `/admin/**`, `/api/**` | **unchanged** (no locale/city) |

`locale ∈ {en, ar, fr}`; `city` uses the existing `cities[].code`
(`greater-cairo`, `alexandria`, …). A short alias like `cairo` is out of scope
here; the existing codes are used verbatim.

## Middleware

New `middleware.ts` with a matcher that skips `api`, `admin`, `login`,
`_next`, and any file path (`.ext`). It:

1. Redirects `/` → `/en`.
2. Validates the first segment against `['en','ar','fr']`; an unknown locale
   is redirected to the `en` equivalent.
3. Syncs the `rosette.locale` cookie from the URL segment so the root layout
   (`lang`/`dir`) and `getServerT()` keep working without per-page changes.

City validation happens in the `[city]` layout (redirect to `/[locale]`
picker when unknown), keeping middleware small.

## Locale & city resolution

- **Locale** stays cookie-backed on the read side; middleware makes the URL
  the source of truth. `getServerT()` and `I18nProvider` are unchanged.
- **Language toggle** changes from `setLocale` (cookie swap) to a navigation
  to the same path under another locale (`/en/cairo/shop` → `/ar/cairo/shop`).
- **City** becomes URL-derived. Replace `readDestination()` call sites:
  - Server pages read `params.city` and pass `cityCode` to their client
    components (`CartPageContent`, `CheckoutForm`).
  - `DestinationGate` becomes the `/[locale]` picker that navigates to
    `/[locale]/[city]`.
  - `storage.ts` (`writeDestination`/`clearDestination`) is no longer used by
    the storefront; remove usages, keep or delete the module as decided in
    the plan.

## Link generation

New client hook `useStorePath()` built on `useParams()`/`usePathname()`
returning `{ locale, cityCode, href(path) }`, where `href('/shop')` →
`/en/cairo/shop`. All internal links (`SiteHeader`, `AccountShell`, product
cards, cart→checkout, checkout→orders, breadcrumbs) switch to it. Server
components build links from `params.locale` + `params.city` directly.

## SEO surface

1. `app/robots.ts` — allow all, reference `/sitemap.xml`.
2. `app/sitemap.ts` — enumerate locale × city × product URLs:
   - `/{locale}/{city}` and `/{locale}/{city}/shop` for every locale+city,
   - `/{locale}/{city}/shop/[slug]` for every locale+city+product,
   - base URL from `SITE_URL` (trailing slash stripped), with a documented
     fallback.
3. `generateMetadata` on the product page:
   - localized title/description from `name`/`nameAr`/`nameFr` +
     `description`/`descriptionAr`/`descriptionFr`,
   - `alternates.canonical` + `alternates.languages` (hreflang en/ar/fr),
   - `openGraph` (title, description, image when present).
4. JSON-LD `Product` schema (name, description, image, `offers` with
   `priceCurrency: EGP` and `price` from `price`), rendered in the product
   page as `<script type="application/ld+json">`.

## Out of scope

- Short city slug aliases (`cairo` vs `greater-cairo`).
- Native apps / PWA.
- Translating admin pages (they remain at `/admin`, English-only).
- Blog/content engine (future slice).

## Testing

- Keep the existing suite green while moving files.
- New tests: `middleware` behavior (redirect + cookie sync), `useStorePath`
  href building, sitemap enumeration (locale×city×product), product
  `generateMetadata` (title/description/hreflang), JSON-LD shape.
- Existing component tests that render pages with `useParams()`/routing will
  be updated to supply the new `locale`/`city` params.

## Phases

- **Phase A** — route restructure (`app/[locale]/[city]`), middleware, city
  threading, link generation, language-toggle navigation.
- **Phase B** — `robots.ts`, `sitemap.ts`, product `generateMetadata` +
  JSON-LD, hreflang/canonical.

Each phase ships green (tests + tsc + build) before the next.
