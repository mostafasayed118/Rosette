# Rosette — Fresh Florist Redesign

**Date:** 2026-08-18
**Status:** Approved design → spec
**Scope:** Visual redesign of the entire Rosette application (storefront + admin), plus a new product-photo pipeline. Styling layer only — no route or behavior changes.

## Context

Rosette is a trilingual (AR/EN/FR) flower-delivery storefront built on Next.js (App Router) + Supabase, with Paymob payments, Gmail email confirmations, a WhatsApp link, and a chat assistant. The current design is an editorial-botanical look: cream canvas, forest-green brand, terracotta accent, Georgia serif, and abstract CSS "product visuals" (circle + stem + ✦) — there are no real photos anywhere and no image support in the data model.

The redesign moves to a **modern fresh florist** identity: bright, airy, photo-forward, with a rose heart, rounded friendly shapes, and a modern serif + sans type pairing.

## Design Decisions (confirmed with owner)

1. **Direction:** Modern fresh florist — bright/airy/photo-forward.
2. **Imagery:** Real photos with a new pipeline (no abstract CSS visuals as the primary product image).
3. **Scope:** Full redesign of both storefront and admin UI.
4. **Typography:** Google Fonts via `next/font` (self-hosted at build, no runtime requests).

## 1 · Design System

### Palette

| Token | Value | Role |
|---|---|---|
| `--color-canvas` | `#faf7f2` | page background (warm ivory) |
| `--color-surface` | `#ffffff` | cards, panels |
| `--color-surface-muted` | `#f3eee6` | subtle fills, chips |
| `--color-ink` | `#2d2a26` | primary text (warm charcoal) |
| `--color-ink-muted` | `#6d675f` | secondary text |
| `--color-brand` | `#c2456d` | primary actions, links (rose) |
| `--color-brand-hover` | `#a83358` | hover |
| `--color-brand-soft` | `#fae3ea` | soft rose fills |
| `--color-accent` | `#6f8f6d` | secondary actions, success hints (sage) |
| `--color-border` | `#e7dfd4` | hairline borders |
| `--color-success` | `#3e7a52` | success states |
| `--color-warning` | `#a06a1f` | warning states |
| `--color-danger` | `#c0392b` | error states |

### Typography

- **Fraunces** (`next/font/google`) — display serif, flower-shop warmth: brand mark, headings, product names. Uses optical sizing (SOFT axis).
- **Inter** (`next/font/google`) — body/UI/labels.
- **Cairo** (`next/font/google`) — Arabic locale display+body (Fraunces/Inter lack Arabic glyphs). The font stack switches per locale: `en`/`fr` → Fraunces + Inter; `ar` → Cairo.
- Display scale: `clamp(2.5rem, 6vw, 4.5rem)`; tighter letter-spacing; generous line-height.
- Type ramp kept from current tokens (`--text-xs` … `--text-xl`) with tuned sizes.

### Shape & Motion

- Radius: `--radius-sm: 10px`, `--radius-md: 16px`, `--radius-lg: 24px`, `--radius-pill: 999px`.
- Shadows: layered soft shadows for cards (`--shadow-card`), hover lift `translateY(-3px)`.
- Buttons: rounded, rose-filled primary; sage/text secondary; pill "chips" for filters/add-ons/status.
- Transitions `.2s ease`; `prefers-reduced-motion: reduce` respected (existing rule kept).

### Implementation notes

- All tokens live in `app/globals.css` `:root` (single source of truth).
- Layout uses logical properties — extended, never regressed.
- Accessibility: focus-visible outlines in brand rose; contrast-checked text/muted pairs.

## 2 · Photo Pipeline (new)

### Data model

- **Migration `004_product_images.sql`**: `alter table public.products add column image_url text;` (nullable).
- Supabase Storage bucket `product-images` (public read, service-role write).

### Seed

- 16 curated flower photos from a free-license source (Pexels/Unsplash), downloaded once and uploaded into the bucket; DB stores the bucket URL (`image_url`).
- Attribution note added to the site footer.
- Products without `image_url` fall back to a soft rose/sage gradient placeholder with the bloom motif — never a broken image.

### Components

- `ProductVisual` evolves into a photo component: `<img>` with `object-fit: cover`, rounded corners, gentle hover zoom; gradient + bloom placeholder when `image_url` is null. All current call sites (`product-card`, hero, cart line, product detail) keep their layout roles.
- Admin product editor gains an **image URL field** so admins can set photos without code.

## 3 · Storefront Pages

- **Home**: photo-led hero (soft gradient wash + rounded photo card), refreshed "how it works"/editorial strip with photos, bloom-motif accents.
- **Shop**: photo cards in responsive grid (2/4 cols), rounded images with hover zoom, filter chips replacing the boxy toolbar, category pills.
- **Product detail**: large hero photo, Fraunces name, price chip, add-on/variant choices as rounded pill-cards, sticky add-to-bag on mobile.
- **Cart / Checkout**: photo thumbnails in line items, rounded summary card, form sections as white cards on ivory.
- **Order page**: timeline refreshed into rounded stepper cards, photo thumbnails.
- **Chat widget**: rounded panel, rose header, pill-shaped bubbles.

## 4 · Admin Redesign (full)

- **Sidebar navigation** (desktop): brand, Dashboard / Orders / Products / Inventory / Delivery, sign-out at bottom; collapses to a top bar on mobile.
- **Dashboard**: stat cards (awaiting fulfillment, revenue today/all-time) with rose/sage icon chips; pipeline as progress-style cards; low-stock in a clean table card.
- **Tables** (orders, inventory, products): white rounded cards, hover rows, pill status badges, consistent toolbar buttons.
- **Forms** (product editor, delivery rules, add city, set quantity): same card language as storefront, rounded inputs.
- Same tokens as storefront; denser layout.

## 5 · RTL & i18n

- Logical properties preserved and extended (`inset-inline-*`, `margin-inline-*`).
- Font stack per locale: `en`/`fr` → Fraunces + Inter; `ar` → Cairo.
- All three dictionaries unchanged in content; design touches structure only.

## 6 · Verification

- Typecheck + full test suite after each task.
- Headless-Chrome screenshots per page (home, shop, product, cart, checkout, order, admin pages) at desktop + mobile widths.
- RTL pass with the Arabic locale; reduced-motion pass.
- Live check: photos actually serve from the storage bucket.

## Out of Scope

- No route changes, no behavior changes, no new pages.
- No changes to order/checkout/payment logic, chat logic, or email logic.
- No changes to the i18n dictionary content.
