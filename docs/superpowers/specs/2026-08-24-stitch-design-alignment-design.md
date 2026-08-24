# Stitch Design Alignment — Rosette Storefront

- **Date:** 2026-08-24
- **Status:** Draft for review
- **Source of truth:** `stitch_rosette_floral_e_commerce_system/` (13 screens + `rosette_boutique_system/DESIGN.md`) and `docs/stitch-master-prompt.md`

## Context

The Rosette storefront already runs the Stitch design tokens (`app/globals.css` matches `DESIGN.md` exactly) and most page structures were built against the original Stitch exports (commit `680db5f`). The 13 screens in `stitch_rosette_floral_e_commerce_system/` are a newer iteration. A side-by-side audit (dev-server screenshots vs. screen PNGs, plus code-level review for auth-gated views) found the design system itself is healthy; the remaining gaps are concentrated in global chrome and a handful of page-level details.

## Goals

1. Global header and footer match the Stitch screens' structure and hierarchy.
2. Every storefront page renders inside full site chrome (header + footer).
3. Collection page uses the 3-column staggered editorial grid with Stitch card faces.
4. Product size variants render as Stitch size pills on the product page (unblocked via an RLS migration granting public reads on `product_variants` and `inventory`).
5. Footer links all resolve to real pages.
6. No functional regressions: cart, checkout, wishlist, auth, i18n (EN/AR/FR), RTL mirroring all keep working.

## Non-goals

- No changes to the design tokens, fonts, or color system (already match DESIGN.md).
- No new commerce features; this is a fidelity pass.
- Product/hero photography art direction (content, not layout) — except replacing dead image URLs.
- Dark mode stays as-is (tokens already define it; Stitch screens are light-only).
- Admin surfaces are out of scope.

## Audit findings (verified 2026-08-24, corrected during planning)

| # | Area | Finding | Severity |
|---|------|---------|----------|
| 1 | Header | Utility nav (Shop the collection / Track order / Sign in / Delivering to / Bag / ♡ / العربية / theme) instead of Stitch brand-center-nav layout | High |
| 2 | Footer | Minimal one-row footer instead of Stitch full footer with link columns and copyright | High |
| 3 | Track page | Renders without SiteHeader/SiteFooter | High |
| 4 | Collection | 2-column grid; target is 3-column staggered; card face shows description + delivery line instead of name + subtitle + price | High |
| 5 | Product detail | Size pills never render: RLS on `product_variants`/`inventory` denies the anon key (verified: anon sees 0 rows, service role sees 26 variants), so the API maps `variants: []` | High (DB) |
| 6 | Product detail | Trust-row icons render faint (low visual weight vs. Stitch) | Low |
| 7 | Homepage | Structure matches; hero imagery is content-level | None (layout) |
| 8 | Account dashboard, Email preferences, Wishlist, Gift card, Fulfillment timeline | Match Stitch | None |

### Planning corrections (2026-08-24)

Three initial findings were false positives, disproven by deeper verification:

- **Destination gate "empty country select"** — caused by a dev-server hydration block (`allowedDevOrigins` blocked `127.0.0.1` chunks during the first capture). Re-capture via `localhost` shows "Egypt" correctly pre-selected. No code change needed.
- **"Dead product image URLs"** — all 16 storage image URLs return HTTP 200. Gray cards in the audit capture were a lazy-load screenshot race (below-fold images not loaded when the full-page shot was taken). No data change needed.
- **"Products lack variant data" / "gift-note preview missing"** — the DB has 26 variant rows and `CheckoutForm.tsx` already renders the gift-note preview (italic serif quote). The real blocker for size pills is the RLS denial in finding 5.

## Design

### 1. SiteHeader rebuild — `components/layout/SiteHeader.tsx`

Stitch structure: wordmark left · center nav · right utility cluster.

- **Left:** "Rosette" wordmark (font-display, primary rose) → links to `/{locale}/{city}` home.
- **Center nav (desktop):** Collections → `/{locale}/{city}/shop`; Bespoke → `/{locale}/{city}/shop?category=vase-arrangement`; Atelier → `/{locale}/{city}/blog`; Gifts → `/{locale}/{city}/gift-cards`. Active link gets the rose underline (as in Stitch screens).
- **Right cluster:** city pill ("Delivering to Cairo" → destination gate), search affordance omitted (no search results page exists; revisit later), EN/AR `LanguageToggle` (existing), wishlist heart (existing), Bag with count (existing), account icon (existing `AccountNavItem`), theme toggle (existing, kept as an icon button).
- **Mobile:** unchanged Sheet pattern, reordered to match the new hierarchy.
- Sticky, hairline bottom border, `bg-background/85 backdrop-blur-md` — unchanged.

### 2. SiteFooter rebuild — `components/layout/SiteFooter.tsx`

Stitch structure: brand column + two link columns + legal row.

- **Brand column:** "Rosette" wordmark, tagline "Quietly unforgettable botanical arrangements, crafted with care in our studio.", copyright "© {year} Rosette Atelier. Crafted in Cairo."
- **Link column A:** City Selector → `/{locale}` (destination gate); Gift Services → `/{locale}/{city}/gift-cards`; Shipping Policy → `/{locale}/{city}/delivery`.
- **Link column B:** Our Story → new `/about`; Contact Us → new `/contact`; Privacy → new `/privacy`.
- Hairline top border on `bg-surface-container-low`, mono meta styling for the legal row.

### 3. New static pages — `app/[locale]/[city]/about|contact|privacy/page.tsx`

Three minimal on-brand pages (editorial headline + prose, SiteHeader/SiteFooter chrome, full i18n via the existing `getServerT` dictionary pattern, RTL-safe). Contact page features the existing WhatsApp support number (`WHATSAPP_BUSINESS_NUMBER`) plus email. Content is short, factual, no lorem.

### 4. Track page chrome — `app/[locale]/[city]/track/page.tsx`

Wrap existing content with `SiteHeader` + `SiteFooter` (same pattern as cart/checkout pages).

### 5. Product variant visibility — new RLS migration `022_variant_inventory_public_reads.sql`

`001_commerce.sql` never created SELECT policies for `product_variants` or `inventory`, and the live project has RLS enabled on them (dashboard toggle), so the anon key reads 0 rows and the storefront maps `variants: []`. The migration idempotently enables RLS on both tables and adds permissive public SELECT policies. Storefront stock exposure is unchanged in kind — the UI already displays inventory-derived availability.

### 6. Collection grid — `features/catalog/CatalogGrid.tsx` + `ProductCard.tsx`

- 3-column grid (`lg:grid-cols-3`) with staggered middle column (`md:mt-12`-style offset on the center column) and varied image aspect ratios cycling `4/5 → 1/1 → 4/5` per Stitch's 3-column screen.
- Card face per Stitch: image (with same-day/next-day sage pill overlay, kept), name (font-display) + subtitle (flower notes) left, price in mono right-aligned. Remove description paragraph and delivery sentence from the card face (they remain on the product page).
- Keep pagination, filters, and empty state as-is.

### 7. Trust-row icon contrast — `features/product/ProductDetail.tsx`

Bump trust icons from `h-7 w-7 text-secondary` to a weight/size that reads at Stitch contrast (verify against screen; likely `h-8 w-8` + `text-secondary` darkened via `text-on-surface-variant` pairing or explicit sage).

## Testing

- **Unit (vitest):** header nav mapping (active states, hrefs), footer link table, catalog grid class contract, product card face contract.
- **E2E (existing Playwright specs):** hero → shop → product → add to bag → checkout flow must stay green; add assertions for header nav links, footer links, track-page chrome, and size-pill visibility after the RLS migration.
- **Visual verification:** re-run the screenshot capture for all routes (scrolling before capture so lazy images resolve) and compare against the 13 Stitch screens; diff before/after.

## Risks

- i18n: all new copy must go through the dictionary (EN/AR/FR) — no hardcoded strings; RTL mirroring must be checked for the new header/footer.
- The Bespoke query-string filter must work with the existing shop filter state (`?category=vase-arrangement` — verified supported by `parseCatalogQuery`).
- The RLS migration must remain read-only in scope: SELECT policies only, no writes exposed to anon; `service_role` (admin client, crons, security-definer functions) bypasses RLS and is unaffected.
