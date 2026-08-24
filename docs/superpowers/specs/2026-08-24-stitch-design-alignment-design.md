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
4. Product size variants render as Stitch size pills on the product page.
5. Destination gate pre-selects Egypt.
6. Footer links all resolve to real pages.
7. No functional regressions: cart, checkout, wishlist, auth, i18n (EN/AR/FR), RTL mirroring all keep working.

## Non-goals

- No changes to the design tokens, fonts, or color system (already match DESIGN.md).
- No new commerce features; this is a fidelity pass.
- Product/hero photography art direction (content, not layout) — except replacing dead image URLs.
- Dark mode stays as-is (tokens already define it; Stitch screens are light-only).
- Admin surfaces are out of scope.

## Audit findings (verified 2026-08-24)

| # | Area | Finding | Severity |
|---|------|---------|----------|
| 1 | Header | Utility nav (Shop the collection / Track order / Sign in / Delivering to / Bag / ♡ / العربية / theme) instead of Stitch brand-center-nav layout | High |
| 2 | Footer | Minimal one-row footer instead of Stitch full footer with link columns and copyright | High |
| 3 | Track page | Renders without SiteHeader/SiteFooter | High |
| 4 | Destination gate | Country select renders empty; Stitch shows "Egypt" pre-selected | Medium |
| 5 | Collection | 2-column grid; target is 3-column staggered; card face shows description + delivery line instead of name + subtitle + price | High |
| 6 | Collection data | Most product images are dead `googleusercontent.com/aida-public` URLs (gray placeholders) | High (data) |
| 7 | Product detail | Variant size pills exist in `ProductDetail.tsx` but seeded products lack variants, so the selector never renders | Medium (data) |
| 8 | Product detail | Trust-row icons render faint (low visual weight vs. Stitch) | Low |
| 9 | Checkout | Gift-note preview card missing from Bag Summary | Low |
| 10 | Homepage | Structure matches; hero imagery is content-level | None (layout) |
| 11 | Account dashboard, Email preferences, Wishlist, Gift card, Fulfillment timeline | Match Stitch | None |

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

### 5. Destination gate fix — `features/destination/DestinationGate.tsx`

Country select defaults to "Egypt" (localized label) instead of rendering empty; city select behavior unchanged.

### 6. Collection grid — `features/catalog/CatalogGrid.tsx` + `ProductCard.tsx`

- 3-column grid (`lg:grid-cols-3`) with staggered middle column (`md:mt-12`-style offset on the center column) and varied image aspect ratios cycling `4/5 → 1/1 → 4/5` per Stitch's 3-column screen.
- Card face per Stitch: image (with same-day/next-day sage pill overlay, kept), name (font-display) + subtitle (flower notes) left, price in mono right-aligned. Remove description paragraph and delivery sentence from the card face (they remain on the product page).
- Keep pagination, filters, and empty state as-is.

### 7. Product variant data — seed/migration

Add Petite/Classic/Grand variants (with `price_delta`) to seeded products so `ProductDetail.tsx` renders the Stitch size-pill selector. Verify one product keeps no variants only if intentionally single-size.

### 8. Dead image URLs — seed/migration

Replace dead `googleusercontent.com/aida-public` product image URLs with working Supabase storage URLs (the bucket already hosts `rose-hour.jpg`, `quiet-orchid.jpg`, etc.). Homepage FEATURED/FEELINGS constants get the same treatment where they reference dead URLs.

### 9. Checkout gift-note preview — `features/cart/CartSummary.tsx` (or checkout summary component)

When any bag line has a gift message, render the Stitch "Gift Note Included" card (heart icon, italic serif quote of the message) above the totals in Bag Summary.

### 10. Trust-row icon contrast — `features/product/ProductDetail.tsx`

Bump trust icons from `h-7 w-7 text-secondary` to a weight/size that reads at Stitch contrast (verify against screen; likely `h-8 w-8` + `text-secondary` darkened via `text-on-surface-variant` pairing or explicit sage).

## Testing

- **Unit (vitest):** header nav mapping (active states, hrefs), footer link table, destination-gate default, catalog grid class contract, gift-note preview conditional.
- **E2E (existing Playwright specs):** hero → shop → product → add to bag → checkout flow must stay green; add assertions for header nav links and footer links presence.
- **Visual verification:** re-run the screenshot capture for all routes and compare against the 13 Stitch screens; diff before/after.

## Risks

- i18n: all new copy must go through the dictionary (EN/AR/FR) — no hardcoded strings; RTL mirroring must be checked for the new header/footer.
- The Bespoke query-string filter must work with the existing shop filter state (verify `category=vase-arrangement` matches the actual category key).
- Seeding variants/images touches data used by tests (`purchase-flow.test.tsx` expects `rose-hour` Classic variant) — keep `rose-hour`'s variant IDs stable.
