# Rosette — shadcn/ui Adoption: Full Component Migration + Dark Mode

**Date:** 2026-08-18
**Status:** Approved design → spec
**Scope:** Replace the hand-rolled CSS design system with shadcn/ui components on Tailwind CSS v4, migrate page-layout classes to Tailwind utilities, and add dark mode. Visual/structural layer only — no route or behavior changes, no data-model changes.

## Context

Rosette is a trilingual (AR/EN/FR) flower-delivery storefront built on Next.js (App Router) + Supabase, with Paymob payments, Gmail email confirmations, a WhatsApp link, and a chat assistant. It just completed a fresh-florist visual redesign (rose `#c2456d` / sage `#6f8f6d` palette, Fraunces + Inter + Cairo fonts, real product photos).

The current design system is hand-rolled: **87 unique CSS classes over 258 usages** across 27 components, all living in one `app/globals.css` with custom properties. There is **no Tailwind, no shadcn, no Radix** today. This adoption moves the component layer onto shadcn/ui (Tailwind v4 + Radix primitives, themed via CSS variables) while **preserving the fresh-florist identity** by mapping existing tokens into shadcn's theme.

## Design Decisions (confirmed with owner)

1. **Scope:** Full component migration — hand-rolled components (Button, Field, StatusMessage, Modal, forms, tables, sidebar) replaced by shadcn equivalents; product visuals stay custom (photo component, not a shadcn primitive).
2. **Layout:** Page-layout classes (hero-section, product-grid, cart-layout, editorial-strip, content-frame, admin-table, etc.) rewritten as Tailwind utilities, not components.
3. **Dark mode:** Added, following the existing locale pattern (localStorage + cookie mirror + class on `<html>`, default respects `prefers-color-scheme`). No new dependency for theming.
4. **Theme:** The fresh-florist palette maps into shadcn's semantic tokens (`--background`, `--primary`, `--radius`, …) via Tailwind v4 `@theme inline`.

## 1 · Foundation (Tailwind v4 + shadcn init)

### Setup

- Install `tailwindcss` + `@tailwindcss/postcss`, add PostCSS config, verify the `@/*` path alias (already present).
- Run `npx shadcn@latest init` → writes `components.json` (`rsc: true`, `cssVariables: true`, `baseColor: neutral`, css → `app/globals.css`).
- `app/globals.css` becomes: `@import "tailwindcss"` + shadcn theme import + `@custom-variant dark` + an `@theme inline` block mapping tokens into shadcn's semantic variables. Existing fresh-florist custom classes are retired (replaced by utilities / shadcn components).

### Token mapping (light)

| shadcn token | fresh-florist value |
|---|---|
| `--background` / `--foreground` | canvas `#faf7f2` / ink `#2d2a26` |
| `--card` / `--card-foreground` | surface `#ffffff` / ink |
| `--popover` / `--popover-foreground` | surface / ink |
| `--primary` / `--primary-foreground` | rose `#c2456d` / surface |
| `--secondary` / `--secondary-foreground` | surface-muted `#f3eee6` / ink |
| `--muted` / `--muted-foreground` | surface-muted / ink-muted `#6d675f` |
| `--accent` / `--accent-foreground` | brand-soft `#fae3ea` / rose-deep `#a83358` |
| `--destructive` / `--destructive-foreground` | danger `#c0392b` / surface |
| `--success` / `--warning` | `#3e7a52` / `#a06a1f` (kept for status uses) |
| `--border` / `--input` / `--ring` | border `#e7dfd4` / border / rose |
| `--radius` | `16px` (scale: sm≈10, md≈13, lg=16, xl≈22 — close to current 10/16/24) |

### Dark mode tokens

- `.dark` block: deep charcoal-green surfaces (`#1a211e` canvas, `#232a26` card), warm off-white foreground, same rose primary with a lighter rose for contrast on dark, sage accents, dimmed borders (`#333d38`-family). Both blocks feed the same `@theme inline` mapping.
- Default: respects `prefers-color-scheme`; explicit user choice persists (localStorage) and mirrors to a cookie for server-rendered admin pages, matching the existing locale mechanism.

### Fonts

- Stay on `next/font`: Fraunces (display), Inter (sans), Cairo (Arabic). Wired into the theme as `--font-display` and `--font-sans` so `font-display` / `font-sans` utilities work; the `:lang(ar)` switch to Cairo is preserved.
- `prefers-reduced-motion` rule kept.

## 2 · Component Inventory (shadcn add)

Components added via `npx shadcn@latest add` — only what the pages actually use:

`button, card, input, textarea, label, badge, table, skeleton, dialog, sheet, checkbox, radio-group, select, separator, tooltip, sidebar, sonner, switch, dropdown-menu, progress`

### Replacements

- **Button** (`components/ui/Button.tsx`) → shadcn button (variants: default rose, secondary sage/outline, ghost, destructive; sizes sm/default/lg/icon). All call sites update; dictionary-driven labels unchanged.
- **Field** (`components/ui/Field.tsx`) → Label + Input/Textarea composition.
- **StatusMessage** (`components/ui/StatusMessage.tsx`) → Card/Alert-style component (success/warning/error variants mapped to tokens).
- **Modal** (`components/ui/Modal.tsx`) → shadcn Dialog (Radix handles focus trap + ESC + scroll lock; RTL via dir).
- **AdminShell** → shadcn Sidebar (desktop rail, Sheet-based mobile top bar — matches the existing collapse behavior).
- **Tables** (orders, inventory, products) → shadcn Table + Badge status pills.
- **Forms** (product editor, delivery rules, add city, set quantity) → shadcn fields (Input, Textarea, Select, Checkbox, RadioGroup where applicable).
- **Storefront cards** (product card, destination, cart-aside, order-card) → shadcn Card.
- **Choice chips / add-ons** → Checkbox / RadioGroup styled as pill-cards.
- **Chat widget** → Card + Button + Input composition, fixed launcher positioning via utilities.
- **Status pills** (order status, low-stock badges) → Badge variants.
- **Stat cards / pipeline** (admin dashboard) → Card + Progress.
- **ProductVisual** stays — it's a photo component (img + gradient-bloom fallback), not a shadcn primitive; its className API is preserved for call sites.

## 3 · Layout Layer → Tailwind Utilities

- All 87 hand-rolled classes retired from `globals.css`. Page-layout classes (hero-section, product-grid, cart-layout, editorial-strip, page-shell, content-frame, form-grid, admin-table, stat-grid, auth-card, timeline, chat-bubbles…) rewritten inline as Tailwind utilities in their pages/components.
- Layout uses logical properties (`ms-*`, `me-*`, `ps-*`, `pe-*`, `start-*`, `end-*`) — RTL/Arabic stays correct; zero hardcoded left/right.
- Spacing/radius/shadows come from the theme (`rounded-lg`, `shadow-sm`/`shadow-md`, `gap-*`).

## 4 · Page Coverage

- **Storefront:** home (hero, how-it-works, editorial band), shop (grid + filter pills), product detail (photo, choices, add-to-bag), cart, checkout, order, track page (from the merged tracking feature), login, chat widget — all restyled on shadcn primitives + utility layout.
- **Admin:** all 8 pages (dashboard, orders, order detail, products, product new/edit, inventory, delivery) on shadcn Sidebar + Table + Card + forms.
- Both light and dark themes verified across all pages + RTL.

## 5 · Verification

- Typecheck + full suite after each task (135 tests; component tests assert roles/accessible names, which survive the migration; the font test checks `<html>` classes — next/font vars stay).
- New tests: ThemeProvider persistence + `dark` class flip; dark tokens present in the theme; shadcn Button renders with variant classes.
- Headless-Chrome screenshots per page (light + dark, EN + AR), admin authenticated render check, live photo check.

## Out of Scope

- No route changes, no behavior changes, no new pages.
- No changes to order/checkout/payment logic, chat logic, email logic, or the i18n dictionary content.
- No data-model changes; no new runtime dependencies beyond Tailwind + shadcn's Radix deps.
