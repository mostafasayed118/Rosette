# Rosette UI Design Review

## Executive summary

Rosette already has a strong, recognizable visual direction: botanical editorial, warm ivory surfaces, deep rose conversion moments, sage support accents, Fraunces display type, Outfit body type, and JetBrains Mono for functional data. The asymmetrical homepage, image-led catalog, sticky order summaries, and bilingual/RTL foundation are all good foundations for a calm premium shopping experience.

The biggest opportunity is not a visual rebrand. It is to make the existing system more disciplined and purchase-focused across breakpoints. The main risks are:

1. Responsive chrome becomes crowded and the catalog filter bar is likely to collide with the sticky header on smaller screens.
2. Checkout and cart contain hardcoded English strings, which breaks the otherwise intentional English/French/Arabic parity.
3. The project has multiple overlapping token layers and many page-level literal values, making component behavior drift between storefront, checkout, and admin surfaces.
4. Form errors and custom selection controls are visually styled but not consistently connected to assistive technology or keyboard focus.
5. Automated coverage verifies the happy path and reduced motion, but not mobile layouts, contrast, or visual regressions.

This is a source/design-reference audit of the storefront, not a live browser screenshot pass at every breakpoint. The recommendations below are therefore prioritized for the highest-confidence systemic improvements first.

## Scope and design context

- Primary audience: gift buyers, often on mobile and under time pressure.
- Desired experience: calm, premium, thoughtful, trustworthy, and artisanal.
- Priority surface: customer storefront first — homepage, shop, product detail, cart, checkout, and tracking.
- Reference material reviewed: `README.md`, `stitch_rosette_floral_e_commerce_system/rosette_boutique_system/DESIGN.md`, representative reference screens, `app/globals.css`, shared UI primitives, storefront routes/components, and E2E/a11y tests.

## What is working well

### Layout and visual hierarchy

- The homepage follows the intended asymmetric editorial structure: copy-led left column, large botanical image right column, then a horizontal featured strip and staggered occasion imagery (`app/[locale]/[city]/(home)/page.tsx:59-156`).
- The product page gives the image the largest visual weight and keeps product name, price, description, choices, gift note, date, and CTA in a clear decision sequence (`features/product/ProductDetail.tsx:57-132`).
- Cart and checkout use a two-column desktop pattern with a sticky summary, which supports quick review without losing the primary task (`features/cart/CartPageContent.tsx:47-111`, `features/checkout/CheckoutForm.tsx:189-573`).
- Tracking uses a strong hierarchy: order state/timeline first, order summary second (`app/[locale]/[city]/track/page.tsx:114-233`).

### Color and typography

- The documented pairing of Fraunces, Outfit, and JetBrains Mono is distinctive and appropriate for the atelier/editorial positioning (`app/layout.tsx:18-21`, `DESIGN.md:129-136`).
- The rose/sage/cream palette has a clear semantic intent: rose for action, sage for delivery/success, warm neutrals for the canvas and surfaces (`app/globals.css:156-223`).
- Primary brand contrast is strong: the main rose against the warm canvas is approximately 8.28:1, and white on the primary button is approximately 8.86:1.
- Reduced-motion support is present both in CSS and in a dedicated E2E test (`app/globals.css:239-283`, `tests/e2e/motion-reduced.spec.ts:15-29`).

### Component and accessibility foundations

- Radix-based Sheet, Dialog, and Select primitives provide a good baseline for focus management and keyboard interaction (`components/ui/sheet.tsx`, `components/ui/dialog.tsx`, `components/ui/select.tsx`).
- Icon buttons generally have accessible names; wishlist controls expose `aria-pressed`, and the language picker exposes a labeled group (`components/wishlist/WishlistHeart.tsx:12-19`, `components/layout/LanguageToggle.tsx:39-55`).
- Global `:focus-visible` styling, 44px icon targets, `aria-current` pagination, and reduced-motion handling are all good foundations (`app/globals.css:258-263`, `components/layout/SiteHeader.tsx:21-23`, `features/catalog/CatalogPagination.tsx:44-74`).

## Prioritized recommendations

Priority uses impact on purchase completion and system-wide consistency, not implementation difficulty.

### P0 — Fix localization parity in cart and checkout

**Evidence**

- Hardcoded English UI remains in `features/checkout/CheckoutForm.tsx:340-385`, `:422`, `:530`, `:545`, and `:563` (`Delivery Date`, `Custom`, `Payment Method`, `Bag Summary`, `Gift Note Included`, and `Delivery to ...`).
- Cart contains hardcoded pluralization and summary copy in `features/cart/CartPageContent.tsx:54-55`, `:71`, and `features/cart/CartLineItem.tsx:42-54` (`item/items`, `Summary`, `Decrease quantity`, `Increase quantity`).
- This is especially damaging for Arabic because the rest of the routing and typography intentionally supports RTL and localized data.

**Action**

- Add dictionary keys for every customer-visible string and every accessible name.
- Use locale-aware pluralization rather than a binary English conditional.
- Pass translated labels into shared quantity controls and summary components.
- Review the full purchase path in English, French, and Arabic after adding keys; confirm that long French labels and Arabic line wrapping do not change the intended hierarchy.

**Why it matters**

Localization is part of the product experience, not a content cleanup task. Consistent language reduces hesitation at the highest-intent stage and protects the premium impression.

### P0 — Rework mobile header and collection controls

**Evidence**

- Desktop header combines navigation, destination, account, bag, wishlist, language, and theme controls in one row (`components/layout/SiteHeader.tsx:54-69`).
- The mobile header keeps bag, wishlist, and menu visible while moving the remaining controls into the Sheet (`components/layout/SiteHeader.tsx:70-87`).
- The collection toolbar is sticky at `top-[57px]` while the header uses `py-4` and a large logo (`features/catalog/CatalogToolbar.tsx:29`, `components/layout/SiteHeader.tsx:54-56`). The effective header height is likely larger than 57px, so the toolbar can sit underneath or overlap the header.
- Search, category chips, occasion chips, and sort are all competing for the same sticky region (`features/catalog/CatalogToolbar.tsx:29-63`).

**Action**

- Create a shared `--site-header-height` token and use it for sticky offsets instead of a magic number.
- At narrow widths, separate the toolbar into two tiers: search + filter button, then a compact sort control. Move the full chip set into a bottom Sheet or collapsible filter panel.
- Keep one primary utility action visible on mobile — bag — and put wishlist/account/theme/language inside the menu unless analytics proves otherwise.
- Use `@container` or explicit narrow-width states so 320–390px layouts do not rely on incidental flex wrapping.
- Verify Arabic RTL behavior for the Sheet side, chip scrolling direction, and sort control alignment.

**Why it matters**

The storefront is visually strong when it has breathing room. A crowded or overlapping sticky region creates the opposite feeling and makes product discovery harder exactly where mobile conversion matters most.

### P0 — Consolidate the token and component system

**Evidence**

- `app/globals.css` defines the same semantic names more than once: `--color-background`, `--color-primary`, and related aliases appear in the theme block and again in the base token block (`app/globals.css:29-93`).
- The file mixes `--color-*`, `--rt-*`, Tailwind/shadcn aliases, HSL sidebar values, and page-level literal colors (`app/globals.css:95-223`).
- Storefront components frequently use literal values such as `rounded-[1.25rem]`, `text-[42px]`, `shadow-[...]`, and `bg-surface-container-low`, while shared primitives default to different radii and heights (`components/ui/button.tsx:7-31`, `components/ui/card.tsx:5-12`, `features/product/ProductDetail.tsx:54-121`).

**Action**

- Establish one source of truth for semantic tokens: canvas, surface, raised surface, ink, muted ink, border, primary, success, warning, danger, radius, shadow, and focus ring.
- Map Tailwind/shadcn aliases to those tokens once; remove duplicate declarations and unused legacy aliases.
- Add storefront primitives for `SiteContainer`, `Eyebrow`, `DisplayHeading`, `PrimaryAction`, `ChoicePill`, `SurfaceCard`, and `StickySummary`.
- Replace repeated arbitrary values with named utilities or component variants.
- Decide whether hover elevation is part of the system. The written design direction says not to lift cards, but `.ambient-glow:hover` currently translates cards by 4px (`app/globals.css:236-238`). For the calm premium direction, prefer border/surface tone transitions and reserve lift for clearly interactive controls.

**Why it matters**

A single token layer reduces visual drift, shortens future iteration time, and prevents checkout/admin surfaces from feeling like a different product.

### P1 — Make checkout errors and custom choices fully accessible

**Evidence**

- Checkout inputs set `aria-invalid`, but most inline errors are rendered as bare `<small>` elements without `aria-describedby` (`features/checkout/CheckoutForm.tsx:223-330`).
- The form focuses the first invalid field for normal validation, but group-level errors return through `setMessage` without a clear focus target (`features/checkout/CheckoutForm.tsx:143-165`).
- Product variants and add-ons hide radio/checkbox inputs inside styled labels, but the label itself does not visibly expose keyboard focus (`features/product/ProductDetail.tsx:80-105`).
- Checkout date choices are buttons with visual selected states, but they do not expose `aria-pressed` or a radio-group relationship (`features/checkout/CheckoutForm.tsx:346-386`).

**Action**

- Give every error a stable ID and connect inputs with `aria-describedby`; add `aria-errormessage` where supported by the chosen test matrix.
- Add a live error summary or focusable alert for group-level failures, then focus it when submission fails.
- Add `focus-within`/`peer-focus-visible` rings to variant, add-on, saved-address, and date-choice wrappers.
- Model one-of-many date choices as a radio group or use `aria-pressed` consistently for a button group.
- Add `aria-live="polite"` to non-blocking success/status messages and `role="alert"` only for blocking errors.
- Ensure all labels and errors use translated strings.

**Why it matters**

The purchase path is where small accessibility gaps become abandonment: a user may see an error but not hear it, or tab into a pill control without knowing which option has focus.

### P1 — Standardize the responsive container and type scale

**Evidence**

- The same layout uses several gutter recipes: `w-[min(calc(100%-3rem),80rem)}`, `max-md:w-[min(calc(100%-2rem),80rem)]`, `px-5 md:px-16`, `px-[64px]`, and `max-w-[1280px]` (`app/[locale]/[city]/shop/(list)/page.tsx:62`, `app/[locale]/[city]/(home)/page.tsx:59-60`, `components/layout/SiteHeader.tsx:55`).
- Headings and body copy use many arbitrary sizes (`text-[42px]`, `md:text-[48px]`, `text-[22px]`, `text-[1.05rem]`) even though the theme defines display/headline/body tokens (`app/globals.css:64-70`, `features/product/ProductDetail.tsx:71-76`, `features/checkout/CheckoutForm.tsx:197-199`).

**Action**

- Add a shared `.site-container` with a consistent `max-width` and fluid `padding-inline: clamp(1.25rem, 4vw, 4rem)`.
- Define and use named type utilities for display, headline, body, and metadata; use `clamp()` for display sizes rather than page-specific breakpoints.
- Keep content line lengths around 45–70 characters for purchase copy and 60–75 characters for editorial copy.
- Add a narrow-width check at 320px and a large-width check around 1440px; confirm that headings do not create orphaned single words in English or Arabic.

**Why it matters**

A consistent container makes the site feel intentional page to page. A fluid type scale preserves the editorial hierarchy without requiring every route to invent its own values.

### P1 — Improve color semantics and dark-theme confidence

**Evidence**

- The sage accent `#6f8f6d` against the light canvas is approximately 3.37:1, below WCAG AA for normal text. It is currently used for eyebrow/meta text (`features/checkout/CheckoutForm.tsx:42`, `app/[locale]/[city]/track/page.tsx:60`) and may be too light depending on size and weight.
- Dark-mode values are defined, but the storefront design reference is light-first and the theme includes a separate HSL sidebar palette (`app/globals.css:110-154`, `:195-202`).

**Action**

- Darken the light-mode sage text token or reserve sage for large text, icons, borders, and non-essential decoration. Use a darker semantic `--color-sage-ink` for small metadata.
- Run contrast checks for every text/background semantic pair in light and dark themes, including disabled, placeholder, success, warning, error, and selected states.
- Keep sidebar/admin tokens in a separate namespace so they cannot silently change customer-facing semantics.

**Why it matters**

The palette can remain warm and premium while improving readability. This is a targeted accessibility adjustment, not a request to flatten the visual identity.

### P1 — Make imagery and card interaction more informative

**Evidence**

- Product cards duplicate the product link around the image and text, while the surrounding `article` is cursor-enabled but not itself interactive (`features/catalog/ProductCard.tsx:27-58`).
- Product image fallback visuals expose an accessible label, but many product cards only expose a generic visual plus truncated description (`features/catalog/ProductCard.tsx:52-59`, `components/ui/ProductVisual.tsx:6-13`).
- The homepage featured gestures link every card to the collection rather than a specific product (`app/[locale]/[city]/(home)/page.tsx:92-102`), which weakens the promise implied by product-like imagery.

**Action**

- Make the entire card one clear interactive target or keep two intentional links with distinct affordances; remove the misleading `cursor-pointer` from non-interactive wrapper elements.
- Keep product name, price, delivery promise, and one concise differentiator visible without relying on hover.
- Link featured homepage products to their actual product detail when data is available; use collection links only for category/occasion tiles.
- Keep motion subtle: image scale should be reduced on touch devices and disabled under reduced motion.

**Why it matters**

Clearer targets reduce mis-clicks and help users understand what is a product versus what is a merchandising/editorial tile.

### P2 — Add a more complete state and visual regression matrix

**Evidence**

- Existing Playwright E2E uses the default browser context and validates desktop-like flows (`tests/e2e/rosette.playwright.test.ts:8-13`, `:19-87`).
- Reduced motion is covered, but there is no visible viewport matrix, automated contrast/a11y scan, or screenshot baseline in the reviewed tests.

**Action**

Add a small deterministic visual/a11y suite for:

- 390 × 844: mobile homepage, shop filters, product choices, cart, checkout.
- 768 × 1024: tablet collection and checkout.
- 1280 × 800: desktop collection and checkout.
- 1440 × 900: large-screen homepage and product detail.
- English LTR, Arabic RTL, and one long-label French case.
- Default motion and reduced motion.
- Empty, loading, validation-error, success, and long-product-name states.

Use axe or equivalent automated checks, and fail on horizontal overflow, missing accessible names, and focus targets that are not visible.

**Why it matters**

The current test suite proves that key journeys work. It does not prove that the UI remains calm, readable, and operable at the widths and locales where the layout changes most.

## Dimension-by-dimension assessment

### Layout structure — Strong foundation, inconsistent systemization

The 12-column hero, editorial stagger, product grid, and sticky summaries all support the intended boutique feel. The weakness is that route-level containers are hand-authored rather than shared, and the sticky filter/header relationship uses a fixed offset. Standardize the container and sticky geometry first.

### Visual hierarchy — Strong on homepage and PDP; too much utility density in chrome

Fraunces headlines, large imagery, and rose CTA contrast create a clear focal path. The header's growing utility set competes with the brand mark and primary navigation. On product and checkout pages, the purchase action is clear, but the summary and form sections could share a more consistent heading/spacing rhythm.

### Color usage — Distinctive and mostly well-structured

The palette is more memorable than generic SaaS neutrals and aligns with the botanical concept. The key correction is a darker sage text token for small metadata plus a single semantic mapping layer. Avoid letting raw Tailwind/shadcn aliases and page literals create a second palette.

### Spacing — Intentional macro rhythm, ad hoc micro rhythm

Large vertical spacing and asymmetry reinforce the editorial tone. At component level, values vary widely between 12/16/20/24/32/48/64 without a single documented usage pattern. A 4px base with named stack tokens would make the experience feel more composed while preserving asymmetry.

### Typography — A strong brand asset that needs stricter application

The font pairing is excellent. The issue is consistency: tokens exist but arbitrary sizes and generic primitive styles are common. Formalize the hierarchy and keep JetBrains Mono limited to prices, order IDs, and functional metadata as the design document intends.

### Component consistency — Good primitives, mixed storefront conventions

Radix primitives and the shared UI folder are solid. However, storefront components often bypass the base primitives with page-level class strings, while checkout uses a separate `stitchInput` pattern. Build a thin storefront layer on top of the existing primitives rather than continuing to add route-specific variants.

### Accessibility — Good foundations, important gaps in custom controls and errors

Focus styling, target sizes, labels, Radix primitives, and reduced motion are positives. The highest-value fixes are error associations, focus-visible styling for hidden-input choice pills, semantic date selection, localized accessible names, and contrast for sage metadata.

### Responsiveness — Thoughtful intent, insufficient verification

The project uses mobile-first collapse patterns, horizontal carousels, responsive grids, and sticky summaries. The main risks are header/toolbar density, magic sticky offsets, and long-label/RTL behavior. Add viewport and locale coverage before making further visual refinements.

## Recommended implementation sequence

### Phase 1 — Conversion and accessibility guardrails

1. Localize all cart/checkout visible text and accessible names.
2. Fix form error semantics and focus handling.
3. Correct sage contrast and define light/dark semantic text tokens.
4. Replace the catalog sticky magic number with a shared header-height token.

### Phase 2 — Responsive and system cleanup

5. Rework mobile header and collection filters into intentional mobile states.
6. Introduce the shared container and typography utilities.
7. Consolidate duplicate token declarations and move repeated styles into component variants.

### Phase 3 — Visual polish and validation

8. Align hover behavior with the calm premium direction; reduce unnecessary lift.
9. Improve product-card link semantics and homepage product destinations.
10. Add viewport, RTL, localization, reduced-motion, overflow, and automated a11y/visual regression coverage.

## Success criteria

- No customer-visible English remains in French or Arabic cart/checkout flows.
- No horizontal overflow at 320px, 390px, 768px, 1280px, or 1440px test widths.
- All form errors are announced and associated with their inputs.
- Small text meets WCAG AA contrast in light and dark themes.
- Header and collection controls occupy predictable, non-overlapping regions at every supported width.
- Storefront pages use the same container, type scale, radius, focus, and surface semantics.
- The interface retains the editorial/botanical identity while reducing utility density and interaction ambiguity.
