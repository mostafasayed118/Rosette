# Admin Stitch Alignment — Design

- **Date:** 2026-08-27
- **Status:** Draft for review
- **Scope:** Admin surface (`/admin/*`) only. Storefront, payment, data model, and i18n content unchanged.
- **Replaces:** the "admin surfaces are out of scope" carve-out from `2026-08-24-stitch-design-alignment-design.md`.

## Context

The Rosette storefront was aligned to the Stitch design system on 2026-08-24 (header rebuild, footer rebuild, 3-column staggered collection grid, RLS migration for variant pills, About/Contact/Privacy pages, photo pipeline). The admin surface (`app/admin/**`) was explicitly carved out of that scope. A ground-truth audit on 2026-08-27 (explore agent, file refs below) found the admin reads as a pre-Stitch sibling of the storefront:

- `app/admin/layout.tsx` does not exist; `SidebarProvider` is recreated inside `components/admin/AdminShell.tsx:28-39` and wrapped around every one of the 17 admin pages.
- Only **1 of 17** admin pages uses `next/image` (`app/admin/reviews/page.tsx:1,77` for review photo thumbnails). `/admin/products`, `/admin/blog`, and `/admin/authors` list pages show no imagery despite carrying `image_url` / `cover_url` / `avatar_url`.
- `components/admin/AppSidebar.tsx:7-16` registers lucide icons for only 8 of 13 nav items; `/admin/blog`, `/admin/authors`, `/admin/cancel-requests`, `/admin/change-requests`, and `/admin/reviews` silently fall back to `Home`.
- The eyebrow pattern `<p className="text-xs font-bold uppercase tracking-[.16em] text-sage">{eyebrow}</p>` is repeated verbatim in 16 of 17 page files.
- Three pages hand-roll tab strips with `<nav className="border-b">` + string-class active/idle constants: `app/admin/reviews/page.tsx:59-61`, `app/admin/cancel-requests/page.tsx:71-73`, `app/admin/change-requests/page.tsx:108-110`.
- One page hand-rolls pagination: `app/admin/notifications/page.tsx:38-45,66-72`.
- One page uses raw `<details><summary>` for history: `app/admin/gift-cards/page.tsx:20`.
- The order-detail page repeats raw `<p className="flex justify-between border-b py-2 text-sm">` rows in three places (`app/admin/orders/[id]/page.tsx:52,58,64-68`).
- Date formatting is duplicated in 5+ pages as `new Date(value).toLocaleString(locale === 'ar' ? 'ar-EG' : locale === 'fr' ? 'fr-FR' : 'en-GB')`.
- `app/admin/loading.tsx` uses M3-era `bg-surface-container` and the legacy `price` class. `app/admin/error.tsx` uses raw `<button>` plus legacy classes (`press`, `text-on-surface-variant`, `hover:bg-on-primary-fixed-variant`).
- `Badge` variant → status mapping is defined in `features/admin/status-labels.ts` but applied inconsistently across pages.

The admin still uses the storefront's tokens (palette and font variables are global), so the fix is structural and primitive-level — no token or font changes needed.

## Goals

1. Admin reads as a quieter, denser sibling of the storefront. Same fonts, same palette, same shadcn primitives, same status color language; less display-marketing, more productive rhythm.
2. Every admin page renders inside a single shared layout that owns the `SidebarProvider` + `AdminShell`.
3. Every admin page uses a single `<PageHeader>` primitive for eyebrow + h1 + optional description + actions slot.
4. Hand-rolled tab strips → shadcn `Tabs`. Hand-rolled pagination → shadcn `Pagination`. Raw `<details>` → shadcn `Accordion`.
5. List pages share the same Card shape (`Card > CardHeader + CardContent > Table`) — including the four pages currently using bare `CardContent`.
6. `next/image` thumbnails on products, blog, and authors list pages; image previews on the three forms that accept image URLs.
7. Status badges resolve to a single, documented color mapping applied everywhere.
8. One `formatDateTime(value, locale)` helper replaces every duplicated date-formatting ternary.
9. Loading and error states render with shadcn tokens, not legacy classes.
10. No regressions in functionality, i18n (EN/AR/FR), RTL mirroring, or existing E2E coverage.

## Non-goals

- No new features, no new pages, no new dependencies.
- No changes to the design tokens, fonts, or color system in `app/globals.css`.
- No changes to admin API routes, validation, business logic, or data model.
- No changes to the storefront.
- No Supabase Realtime migration of `AutoRefresh` — separate architectural slice.
- No migration of forms to react-hook-form / shadcn `Form` — separate architectural slice.
- No new i18n keys unless required by a new visible string (e.g. error retry label).

## Direction (confirmed)

**Token-aligned, denser.** Admin inherits:

- Fonts: Fraunces (display), Inter (body), Cairo (Arabic display + body), JetBrains Mono (price/numerics) — same as storefront, via `app/layout.tsx` `next/font` setup.
- Palette: `--color-brand` (rose `#8e1a3f` light, `#d96a8e` dark) for primary CTAs and active nav state; `--color-accent` (sage `#6f8f6d` light, `#8fa98d` dark) as the dominant accent (eyebrow, success badges, in-progress indicators); `--color-canvas`/`--color-surface` cream + white; destructive red for failures.
- Primitives: shadcn `Card`, `Badge`, `Button`, `Input`, `Select`, `Textarea`, `Field`, `Table`, `Sheet`, `Dialog`, `DropdownMenu`, `Tabs`, `Pagination`, `Accordion`, `Skeleton`, `Sidebar`.

Admin-specific density deltas (vs. storefront):

- h1: `font-display text-[clamp(1.75rem,3vw,2.25rem)] leading-tight tracking-[-.02em]` — not the storefront's marketing-display scale.
- Eyebrow: keep sage tracked uppercase, but treat as the standard `<PageHeader eyebrow>` slot rather than a hero.
- Imagery: 48×48 product thumbnails, 32×32 author avatars, 96×96 form previews — never full-bleed in admin.
- Status pills: small (`text-xs`), rose for primary active, sage for in-progress success, destructive for failures, secondary for pending/neutral.

## Findings being fixed

Numbered for traceability into the implementation plan.

1. **No `app/admin/layout.tsx`** — `SidebarProvider` recreated per page.
2. **`AdminShell.tsx:33`** uses `max-md:block` (non-standard Tailwind variant).
3. **5 missing sidebar icons** in `components/admin/AppSidebar.tsx` (blog, authors, cancel-requests, change-requests, reviews).
4. **Eyebrow markup duplicated 16×** across page files.
5. **Three hand-rolled tab strips** on reviews / cancel-requests / change-requests.
6. **Hand-rolled pagination** on notifications.
7. **Raw `<details>`** on gift cards history.
8. **Bare `<CardContent>`** on delivery / promos / blog / authors list pages.
9. **No list-page imagery** on products / blog / authors.
10. **No form image previews** on `ProductForm` / `AuthorForm` / `BlogForm`.
11. **Date formatting duplicated** across 5+ pages.
12. **`loading.tsx`** uses legacy `bg-surface-container` + `price` class.
13. **`error.tsx`** uses raw `<button>` + legacy `press`/`text-on-surface-variant` classes.
14. **Order detail repeats raw row markup** in 3 places.
15. **Status badge color mapping** inconsistent across pages.
16. **Conditional fragment-spread table columns** on cancel-requests / change-requests (defer deep refactor; do minimal cleanup only).

## Section 1 — Layout lift

### `app/admin/layout.tsx` (new)

```tsx
import type { ReactNode } from 'react';
import { SidebarProvider } from '@/components/ui/sidebar';
import { AdminShell } from '@/components/admin/AdminShell';

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <SidebarProvider>
      <AdminShell>{children}</AdminShell>
    </SidebarProvider>
  );
}
```

All 17 page files remove their `<AdminShell>…</AdminShell>` wrapper and return their content directly. `AdminShell` is reduced to the inner shell (header, sign-out, sidebar trigger) without the provider.

### `components/admin/AdminShell.tsx`

- Remove the wrapping `SidebarProvider` (line 28-39); keep the rest of the shell.
- Fix line 33: replace `max-md:block` with `md:hidden` (or remove if the desktop-only sidebar header is already gated correctly by the Sidebar primitive).
- Sidebar header brand mark (`<span className="font-display text-2xl tracking-tight text-primary">Rosette</span>`) stays as a `<span>` because it is inside the shadcn SidebarHeader — that's the right primitive boundary.

## Section 2 — PageHeader primitive

### `components/admin/PageHeader.tsx` (new)

```tsx
import type { ReactNode } from 'react';

type PageHeaderProps = {
  eyebrow: string;
  title: string;
  description?: string;
  actions?: ReactNode;
};

export function PageHeader({ eyebrow, title, description, actions }: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="text-xs font-bold uppercase tracking-[.16em] text-sage">{eyebrow}</p>
        <h1 className="font-display text-[clamp(1.75rem,3vw,2.25rem)] leading-tight tracking-[-.02em] text-on-surface">{title}</h1>
        {description ? (
          <p className="mt-2 text-sm text-on-surface-variant max-w-prose">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}
```

Every admin page replaces its eyebrow `<p>` + h1 `<h1>` pair with `<PageHeader eyebrow={t('adminXxxEyebrow')} title={t('adminXxxTitle')} description={t('adminXxxDescription')} actions={…} />`. Translation keys reuse the existing `features/i18n/dictionaries.ts` entries where they already exist; new keys are added only when no existing key fits.

## Section 3 — Sidebar icons

### `components/admin/AppSidebar.tsx`

Replace the 8-entry icon map with a 13-entry map covering every `NAV_ITEMS` entry. Drop the `Home` fallback.

| Path | Icon (lucide-react) |
|---|---|
| `/admin` | `LayoutDashboard` |
| `/admin/orders` | `ShoppingBag` |
| `/admin/products` | `Package` |
| `/admin/inventory` | `Boxes` |
| `/admin/delivery` | `Truck` |
| `/admin/promos` | `Ticket` |
| `/admin/gift-cards` | `Gift` |
| `/admin/notifications` | `Bell` |
| `/admin/blog` | `BookOpen` (new) |
| `/admin/authors` | `Users` (new) |
| `/admin/cancel-requests` | `XCircle` (new) |
| `/admin/change-requests` | `Pencil` (new) |
| `/admin/reviews` | `Star` (new) |

The active-state styling (`SidebarMenuButton` `isActive` + `data-active`) already exists at `AppSidebar.tsx:30`; no change required beyond wiring the correct icon per item.

## Section 4 — Imagery pillar

### List-page thumbnails

| Page | Column | Size | Crop | Placeholder |
|---|---|---|---|---|
| `/admin/products` | first | 48×48 | `rounded-md object-cover` | tone swatch (`bg-secondary text-secondary-foreground` with product tone color) when `image_url` is null |
| `/admin/blog` | first | 48×48 | `rounded-md object-cover` | first-letter chip (`bg-primary/10 text-primary font-display text-lg`) when cover is null |
| `/admin/authors` | first | 32×32 | `rounded-full object-cover` | initials chip (`bg-primary/10 text-primary font-display rounded-full`) |

All thumbnails are `next/image` with `sizes="48px"` (or `32px` for avatars), `loading="lazy"`, no `priority`. URLs come from existing repo fields (`image_url`, `cover_url`, `avatar_url`). Supabase storage host is already in `next.config.ts` `images.remotePatterns` per the Aug 24 spec.

### Form previews

- **ProductForm**: 96×96 `next/image` under `imageUrl` field; empty state renders a 96×96 dashed `rounded-md` box with `text-on-surface-variant` "No image".
- **AuthorForm**: 64×64 `rounded-full` preview under `avatarUrl` field; empty state is an initials chip.
- **BlogForm**: 96×96 `rounded-md` preview under cover field; empty state is the first-letter chip.

Each preview is a small `<ImagePreview url={value} kind="product" | "avatar" | "cover" />` helper component (`components/admin/ImagePreview.tsx`) to avoid duplication.

## Section 5 — Tabs

### `components/ui/tabs.tsx` (verify presence; add via shadcn CLI if missing)

The storefront already uses `components/ui/dialog.tsx`, `dropdown-menu.tsx`, `sheet.tsx`, `sidebar.tsx`, `tooltip.tsx`, etc. `tabs.tsx` and `pagination.tsx` and `accordion.tsx` may not yet be installed — verify with `Test-Path -LiteralPath 'components/ui/tabs.tsx'`; if absent, run `npx shadcn@latest add tabs pagination accordion` (which scaffolds the Radix-backed shadcn primitives into `components/ui/`).

### Server-rendered URL-driven tabs

Tabs on reviews / cancel-requests / change-requests are URL-driven (`?tab=pending`) so pages stay server-rendered. Pattern:

```tsx
// app/admin/reviews/page.tsx
type SearchParams = { tab?: string };

export default async function AdminReviewsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { tab = 'pending' } = await searchParams;
  // ... fetch + render based on tab
  return (
    <>
      <PageHeader eyebrow={t('adminReviewsEyebrow')} title={t('adminReviewsTitle')} />
      <Tabs defaultValue={tab} className="mt-6">
        <TabsList>
          {REVIEW_TABS.map((t) => (
            <TabsTrigger key={t.value} value={t.value} asChild>
              <Link href={`/admin/reviews?tab=${t.value}`}>{t.label}</Link>
            </TabsTrigger>
          ))}
        </TabsList>
        {/* TabsContent not used; content is rendered below based on `tab` */}
      </Tabs>
      <Card className="mt-4">…</Card>
    </>
  );
}
```

`TabsTrigger asChild + Link` keeps the URL the source of truth while inheriting shadcn tab styling and Radix keyboard handling.

## Section 6 — Pagination

### Notifications

Replace `app/admin/notifications/page.tsx:38-45,66-72` with shadcn `Pagination`:

```tsx
<Pagination>
  <PaginationContent>
    <PaginationItem><PaginationPrevious href={`?page=${page - 1}`} /></PaginationItem>
    <PaginationItem><PaginationLink href="?page=1">1</PaginationLink></PaginationItem>
    {/* … */}
    <PaginationItem><PaginationNext href={`?page=${page + 1}`} /></PaginationItem>
  </PaginationContent>
</Pagination>
```

URL remains the source of truth (`?page=N`); the existing `NotificationsToolbar` search + status/type filters compose with the page param via URLSearchParams helpers.

## Section 7 — Accordion

### Gift cards history

Replace the raw `<details><summary>` in `app/admin/gift-cards/page.tsx:20` with shadcn `Accordion`:

```tsx
<Accordion type="single" collapsible>
  <AccordionItem value="history">
    <AccordionTrigger>{t('giftCardHistoryTitle')}</AccordionTrigger>
    <AccordionContent>{history}</AccordionContent>
  </AccordionItem>
</Accordion>
```

If the history is per-row (one accordion per gift card), `type="multiple"` is used instead.

## Section 8 — Card style unification

The four pages currently using bare `CardContent` migrate to the list-card pattern:

| Page | Current | Target |
|---|---|---|
| `app/admin/delivery/page.tsx` | `<Card><CardContent>{form}</CardContent></Card>` | `<Card><CardHeader><CardTitle>{t('adminDeliveryExisting')}</CardTitle></CardHeader><CardContent>{form}</CardContent></Card>` |
| `app/admin/promos/page.tsx` | same | same |
| `app/admin/blog/page.tsx` | same | same |
| `app/admin/authors/page.tsx` | same | same |

`CardTitle` strings come from the dictionary (new keys added as needed). `CardDescription` is optional and only added when the section's purpose benefits from a one-line description.

## Section 9 — Status badge color mapping

### `features/admin/status-labels.ts` (extend existing)

Existing variant resolution is extended and documented:

| Status | Variant | Rationale |
|---|---|---|
| `paid`, `delivered`, `active`, `completed`, `approved`, `redeemed` | `success` | Positive terminal states — sage green |
| `preparing`, `ready_for_delivery`, `payment_started`, `confirmed`, `out_for_delivery`, `sent`, `in_progress` | `default` | Brand-rose for active in-progress states |
| `pending`, `scheduled`, `draft` | `secondary` | Neutral waiting state |
| `refunded`, `partially_refunded` | `warning` | Amber for monetary reversal |
| `payment_failed`, `cancelled`, `expired`, `rejected`, `failed` | `destructive` | Red for terminal failure |

Variant functions already exist (`fulfillmentBadgeVariant`, `paymentBadgeVariant`); add `deliveryStatusVariant`, `notificationStatusVariant`, `cancelRequestStatusVariant`, `changeRequestStatusVariant`, `reviewStatusVariant`, `promoStatusVariant`, `giftCardStatusVariant` — each with the same pattern (lookup map + safe default).

Apply across:

- Orders list (payment + fulfillment columns).
- Order detail (status summary + timeline).
- Dashboard pipeline cards.
- Notifications list (`delivery_status` column).
- Reviews list (`status` column).
- Cancel requests list (`status` column).
- Change requests list (`status` column).
- Promos list (`active` boolean → `success` / `secondary`).
- Gift cards list (`status` column).

## Section 10 — Date formatting helper

### `lib/date.ts` (new)

```ts
import type { Locale } from '@/features/i18n/types';

function localeTag(locale: Locale): string {
  switch (locale) {
    case 'ar': return 'ar-EG';
    case 'fr': return 'fr-FR';
    default: return 'en-GB';
  }
}

export function formatDateTime(value: string | Date, locale: Locale): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  return date.toLocaleString(localeTag(locale), { dateStyle: 'medium', timeStyle: 'short' });
}

export function formatDate(value: string | Date, locale: Locale): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  return date.toLocaleDateString(localeTag(locale), { dateStyle: 'medium' });
}
```

Replace every duplicated `new Date(value).toLocaleString(locale === 'ar' ? …)` ternary with `formatDateTime(value, locale)`. Call sites: `orders/[id]/page.tsx:65,78-79,88`, `reviews/page.tsx:57`, `cancel-requests/page.tsx:46`, `change-requests/page.tsx:54`.

## Section 11 — Loading skeleton

### `app/admin/loading.tsx`

Replace raw `<div className="bg-surface-container animate-pulse">` blocks with the shadcn `Skeleton` primitive (`components/ui/skeleton.tsx`, verify presence):

- A `PageHeader`-shaped skeleton: sage-tracked bar + h1-sized bar + actions slot.
- A Card-shaped skeleton with a header row + 6 row skeletons that hint at the table rhythm.

Background uses `bg-muted` (not the legacy `bg-surface-container`), removing the `price` class.

## Section 12 — Error page

### `app/admin/error.tsx`

Replace raw `<button>` (lines 6, 12, 16) with `<Button variant="default" size="lg">`. Replace `text-on-surface-variant` with `text-muted-foreground`, `bg-primary` with `bg-primary` (keep — tokenized), and drop `press`/`price` legacy classes. The error container becomes a `Card` centered on the canvas.

## Section 13 — Order-detail row primitive

### `components/admin/KeyValueRow.tsx` (new)

```tsx
import type { ReactNode } from 'react';

export function KeyValueRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border/50 py-2 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-end text-foreground">{value}</dd>
    </div>
  );
}
```

Replace the three raw `<p className="flex justify-between border-b py-2 text-sm">` instances in `app/admin/orders/[id]/page.tsx:52,58,64-68`.

## Section 14 — Conditional table columns (minimal cleanup only)

The fragment-spread pattern in `cancel-requests/page.tsx:85,90-105` and `change-requests/page.tsx:122,128-139` is fragile but functionally correct. A full `<RequestQueue>` extraction is a separate refactor (it spans data fetching, conditional actions, and per-tab content). For this slice:

- Extract the shared `<RequestTabs>` URL-driven shadcn `Tabs` wrapper used by both pages.
- Leave the per-tab content inside each page; no behavioral change.

A `RequestQueue` deep refactor is explicitly **out of scope** and noted for the future slice.

## Section 15 — `AutoRefresh`

**Leave as-is.** Real-time migration (Supabase Realtime, SSE, or Pusher) is a separate architectural slice that touches routing, error handling, and observability. The current `AutoRefresh` polling works for the existing load.

## Out of scope (follow-up slices)

- Migrating `AutoRefresh` to Supabase Realtime.
- Migrating forms to react-hook-form / shadcn `Form` / `FieldGroup` / `Fieldset`.
- Extracting `<RequestQueue>` shared table for cancel/change requests.
- Per-route skeleton loading patterns (only the global `loading.tsx` is updated here).
- Adding `next/image` to product detail / order detail imagery (storefront concern).

## Testing

TDD in an isolated worktree, fakes only — no live Supabase, no live browser.

### Unit (vitest)

1. `lib/date.ts` — `formatDateTime` / `formatDate` for `en`/`ar`/`fr` locales; string and `Date` inputs; invalid date strings return `'Invalid Date'` (`Date.toLocaleString` default) without throwing.
2. `features/admin/status-labels.ts` — every existing + new status → correct i18n key and Badge variant; unknown statuses → safe `secondary` default.
3. `components/admin/PageHeader.tsx` — eyebrow + title + optional description + actions; actions slot accepts arbitrary nodes; nothing crashes on missing optional props.
4. `components/admin/KeyValueRow.tsx` — renders label + value with the documented classes.
5. `components/admin/AppSidebar.tsx` (icon map) — every `NAV_ITEMS` entry resolves to a lucide icon (no `Home` fallback).
6. `components/admin/ImagePreview.tsx` — render with url / without url; correct size + crop per `kind` prop.

### Integration (component test)

7. `components/admin/AdminShell.tsx` (after layout lift) — renders children directly without owning `SidebarProvider`.
8. `app/admin/layout.tsx` smoke render — wraps children in `SidebarProvider` + `AdminShell`.

### E2E (existing Playwright)

- Headless-Chrome screenshots before/after for every admin route (desktop 1280 + mobile 390 widths).
- Verify tab navigation still works after shadcn `Tabs` migration: `/admin/reviews?tab=pending` and `?tab=approved` both render correct content; switching tabs changes URL.
- Verify pagination URL contract: `/admin/notifications?page=2` renders the second page.
- Verify sidebar active state still highlights the correct route.

### Gate

`npm test` (existing + new) + `tsc --noEmit` + `npm run build` + `git diff --check` + secret scan before merge.

## Risks

- **i18n:** new visible strings (error retry label, any CardTitle/CardDescription added for the 4 unified pages, ImagePreview empty states) must go through `features/i18n/dictionaries.ts` for EN/AR/FR. RTL mirroring is verified for new components by smoke-rendering the admin in `ar`.
- **shadcn scaffolding:** `tabs.tsx` / `pagination.tsx` / `accordion.tsx` / `skeleton.tsx` may not yet be in `components/ui/`. Verify before use; if absent, run `npx shadcn@latest add tabs pagination accordion skeleton` (no behavioural changes, just adds the Radix primitives).
- **`AdminShell` extraction:** the existing `AdminShell` wraps the page in `SidebarProvider`. Lifting that to `app/admin/layout.tsx` changes the React tree slightly; existing client components that read sidebar context keep working because the provider still wraps them — just at the layout level. Verified by the existing E2E tests for sidebar active state.
- **External image URLs:** some product rows may have external hotlinks (Unsplash, etc.). `next/image` will proxy them through the Next image optimizer; verify `next.config.ts` `images.remotePatterns` covers them (already covers Supabase per Aug 24 spec; add Unsplash if not present).
- **`AutoRefresh` interaction with `Tabs`:** `AutoRefresh` calls `router.refresh()` after interval. After tabs migrate to URL-driven shadcn tabs, refresh re-renders with the same `?tab` value; behaviour unchanged.

## Verification checklist

- [ ] All 17 admin pages return content directly (no `<AdminShell>` wrap in the page body).
- [ ] `app/admin/layout.tsx` exists and owns `SidebarProvider` + `AdminShell`.
- [ ] All 17 pages use `<PageHeader>` for eyebrow + h1.
- [ ] `AppSidebar` shows the correct lucide icon for every nav item (no `Home` fallback).
- [ ] Products list shows 48×48 product photos (or tone swatch fallback).
- [ ] Blog list shows 48×48 cover thumbnails (or first-letter chip fallback).
- [ ] Authors list shows 32×32 avatars (or initials chip fallback).
- [ ] `ProductForm` / `AuthorForm` / `BlogForm` show image previews.
- [ ] Reviews / cancel-requests / change-requests use shadcn `Tabs` with URL sync.
- [ ] Notifications uses shadcn `Pagination`.
- [ ] Gift cards uses shadcn `Accordion`.
- [ ] Delivery / promos / blog / authors list pages use the `CardHeader` pattern.
- [ ] Status badges use the unified mapping across all 9 listed call sites.
- [ ] `formatDateTime` replaces every duplicated date-formatting ternary (5+ call sites).
- [ ] `loading.tsx` uses shadcn `Skeleton` + tokens (no `bg-surface-container`, no `price`).
- [ ] `error.tsx` uses `<Button>` + tokens (no raw `<button>`, no `press`/`text-on-surface-variant`).
- [ ] Order detail uses `KeyValueRow` in three places.
- [ ] All unit + integration tests pass.
- [ ] `tsc --noEmit` clean.
- [ ] `npm run build` green.
- [ ] E2E screenshots captured before/after for all admin routes at desktop + mobile widths.
- [ ] No secret in diff.
