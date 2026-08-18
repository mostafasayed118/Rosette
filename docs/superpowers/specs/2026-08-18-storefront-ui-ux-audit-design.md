# Storefront UI/UX + Responsive Audit — Design

Date: 2026-08-18
Status: Approved
Scope: Customer-facing storefront only (slice 1 of 3). Admin audit and architecture hardening are separate slices.

## Goal

Fix concrete UI/UX, accessibility, responsiveness, and consistency defects in the customer storefront without a visual redesign. The design foundation (tokens, dark mode, RTL, focus rings, reduced-motion) is already in place and stays as-is.

## Non-goals

- No visual redesign: fonts, colors, tokens, and page structure are unchanged.
- No admin-page changes (separate slice).
- No backend/data-model changes.
- No new dependencies beyond what already exists in `package.json`.

## Findings being fixed

1. **Hardcoded dates** — `ProductDetail.tsx` and `CheckoutForm.tsx` hardcode `min="2026-08-17"` and default `2026-08-20`; both go stale.
2. **Dead UI** — home hero renders a static "01 / 04" caption and "Quietly memorable" label implying a carousel that does not exist.
3. **Mobile header** — `max-md:flex-wrap` collapses six controls into a messy multi-row blob; language/theme/destination controls are far below 44×44px touch targets.
4. **Hero height** — `min-h-[620px]` section + `min-h-[520px]` image creates an oversized first screen on mobile.
5. **Image performance/CLS** — `ProductVisual` uses a raw `<img>` with no intrinsic size and no `next/image` optimization; hero hotlinks Unsplash.
6. **Duplicate form styling** — `inputClass`/`selectClass` constants are repeated in `track/page.tsx` and `CheckoutForm.tsx` instead of the existing shadcn `Input`/`Select`; `ProductDetail.tsx` uses a raw `<textarea>` instead of `Textarea`.
7. **Duplicate add-on label mapping** — `handwrittenNote`/`darkChocolate`/`balloon` mapping is duplicated in `ProductDetail.tsx` and `CartLineItem.tsx`.

## Section 1 — Foundation

### Dynamic delivery dates (`features/delivery/dates.ts`)

Pure, testable helpers:

- `minDeliveryDate(now: Date): string` → today's date in local time, formatted `YYYY-MM-DD`.
- `defaultDeliveryDate(now: Date): string` → today + 2 days, same format.

`ProductDetail` and `CheckoutForm` replace their hardcoded date literals with these helpers (using `new Date()` at call site; `now` is injected for tests).

### Image handling (`components/ui/ProductVisual.tsx`)

- When `imageUrl` is present, render `next/image` with `fill` + `sizes` + `alt={label}`, replacing the raw `<img>`.
- When `imageUrl` is absent, keep the existing `color-mix` bloom fallback exactly as today.
- The wrapper keeps its `relative` positioning and min-height logic (compact vs full, className overrides).
- `next.config.ts` gains `images.remotePatterns` for `images.unsplash.com` and the Supabase storage host (`*.supabase.co`).

### Shared form components

- Replace raw `<select>`/`<input>` + the `inputClass`/`selectClass` constants in `CheckoutForm.tsx` and `app/track/page.tsx` with the existing shadcn `Select` and `Input`.
- Replace the raw `<textarea>` in `ProductDetail.tsx` with the existing shadcn `Textarea`.
- Remove the now-unused duplicated class constants.

### Add-on label helper (`features/catalog/add-on-labels.ts`)

- `addOnLabel(item, t)` maps `note`/`chocolate`/`balloon` to their i18n keys and falls back to `item.name`.
- Used by `ProductDetail.tsx` and `CartLineItem.tsx`; the duplicated inline mapping is removed.

## Section 2 — Header & mobile navigation (`components/layout/SiteHeader.tsx`)

- **Desktop (≥ `md`)**: unchanged inline nav.
- **Mobile (< `md`)**: logo + bag + a hamburger button that opens a shadcn `Sheet` containing Shop, Track, destination, language toggle, and theme toggle as full-width rows.
- **Touch targets**: theme toggle and language toggle become padded buttons ≥ 44×44px (icons at `h-5 w-5`); destination button gets adequate padding; bag stays a pill with a min-height.
- **Accessibility**: hamburger gets `aria-label` + `aria-expanded`; theme toggle keeps `aria-label`; nav keeps `aria-label="Main navigation"`; the sheet inherits Radix keyboard/ESC handling.

## Section 3 — Page-level fixes + accessibility pass

- **Hero** (`app/page.tsx`): reduce hero min-heights on small screens (e.g. section `min-h-[400px]`, image `min-h-[360px]` at `< md`); remove the static "01 / 04" caption and its dead "Quietly memorable" label.
- **Choice cards** (`ProductDetail.tsx`, `CheckoutForm.tsx`): keep native radio/checkbox inputs but add a visible `focus-visible` ring on the wrapping label so keyboard focus is obvious.
- **Touch targets**: verify interactive elements (quantity stepper, remove, promo apply) meet 44px where practical.
- **Verify (no change expected)**: `lang`/`dir` attributes, viewport meta, and `prefers-reduced-motion` handling are already correct in `layout.tsx` + `server-html.ts` + `globals.css`.

## Section 4 — Tests & verification

TDD in an isolated worktree, fakes only (no live services or browser):

1. `features/delivery/dates.ts` — `minDeliveryDate`/`defaultDeliveryDate` with injected `now` (today, +2 days, month/year boundaries, local-date formatting).
2. `features/catalog/add-on-labels.ts` — maps known ids and falls back to `item.name`.
3. `ProductVisual` — renders `next/image` with `alt` when URL set; bloom fallback (no `img`) when absent; compact vs full sizing (update existing `ProductVisual.test.tsx`).
4. `SiteHeader` — desktop renders inline links; mobile renders hamburger + `Sheet` with the same destinations; controls carry accessible labels (component test with existing test utils).
5. Full gate: `npm test` (169 existing + new) + `tsc --noEmit` + `npm run build` + `git diff --check` + secret scan before merge.
