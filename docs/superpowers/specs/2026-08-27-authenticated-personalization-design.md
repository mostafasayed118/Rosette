# Authenticated Personalization — Recommended for you + Buy again — design

Date: 2026-08-27
Status: approved for planning
Scope: A) Storefront growth → 2) Personalization (authenticated-first, heuristic affinity)

## Problem

Rosette's catalog is effective for browsing (`features/catalog/catalog-utils.ts:21-40` — substring search, category/occasion/price filters, `recommended|newest|price-asc|desc`) but has no memory for signed-in customers. A returning buyer who ordered `rose-hour` for a birthday sees the same generic grid as a first-time visitor, despite the system holding purchase history (`orders`→`order_items` in `supabase/migrations/001_commerce.sql:71-106`) and a wishlist (currently localStorage `rosette.wishlist.v1` in `features/wishlist/storage.ts:1`).

This feature adds authenticated-only personalization so logged-in customers see relevant next steps without any instrumentation for anonymous visitors. `Recommended for you` scores by affinity to past categories and occasions; `Buy again` surfaces repeat purchasable favorites. Anonymous traffic is unchanged.

## Scope

In scope for v1:

- Authenticated personalization for Supabase-logged-in customers only; anonymous sees existing catalog unchanged.
- `wishlist_items` server sync so wishlist can feed affinity (one table, RLS, idempotent upsert on login).
- Heuristic scoring in a single Postgres RPC `get_personalized_picks` (security definer, caller filtered by `customer_id = auth.uid()`).
- Two surfaces: `/[locale]/shop` (Buy again strip + Recommended carousel) and `/[locale]/shop/[slug]` (Recommended only, excluding current slug).
- Fallback to `newest` when insufficient signal so UI never renders empty.
- i18n en/ar/fr via `features/i18n/dictionaries.ts`; RTL and logical CSS via existing locale flow.
- No anonymous tracking; no view-history events; no email/push; no embeddings/ML.

Explicitly deferred:

- **View-history personalization.** No `product_view_events` table or `POST /api/personalization/view`. Approach 2 remains a clean additive layer (extend RPC to blend views) once heuristic lift is measured.
- **Anonymous personalization.** No localStorage → server promotion beyond wishlist sync; avoids fingerprinting and keeps v1 privacy-trivial.
- **Collaborative / global trending model.** Co-purchase counts are not in v1; `newest` is the global fallback. Trending can be added as a materialized view later without UI contract change.
- **Homepage gate edits.** `app/[locale]/page.tsx:6` destination gate is untouched in v1.

## Architecture

```
app/[locale]/shop/page.tsx ──> features/personalization/provider.ts ──┐
app/[locale]/shop/[slug]/page.tsx ───────────────────────────────────┤
       │                                                              │
       ├─ GET /api/personalization/picks (auth, zod, private cache) ─┤
       └─ POST /api/wishlist/sync (auth, upsert wishlist_items)       │
                                                                     ▼
                                         Supabase: get_personalized_picks RPC
                                         reads orders + order_items + wishlist_items + products(active)
                                         returns slugs+scores → provider hydrates → Product[]
```

- New module `features/personalization/` owns all personalization. It depends on `features/catalog/types.ts:5` (`Product`) and `features/catalog/row-mappers.ts` for hydration but never mutates catalog, cart, or checkout state.
- Provider pattern mirrors `features/catalog/provider.ts` and `features/wishlist/WishlistProvider.tsx`: `getPersonalizationProvider()` selects `supabase-repository` when Supabase env is present else `local-repository` (seed `features/catalog/data.ts`).
- Routes use the established structured logger (post `logRouteError` refactor) and zod validation style from `catalog-utils.ts:42`.

## Data model

New migration `supabase/migrations/029_personalization.sql` (follows `001_commerce.sql` conventions; next sequential after `028_hardened_privileges.sql`).

### `wishlist_items`

| Column | Type | Notes |
| --- | --- | --- |
| `customer_id` | uuid not null | → `profiles(id)` on delete cascade |
| `product_slug` | text not null | → `products(slug)` on delete cascade |
| `added_at` | timestamptz not null default now() | ordering |

- PK `primary key (customer_id, product_slug)` — idempotency.
- RLS `enable row level security`; policy `owners manage own wishlist`: `for all using (customer_id = auth.uid()) with check (customer_id = auth.uid())`.
- Index `wishlist_customer_idx on wishlist_items(customer_id, added_at desc)`.
- No changes to `products` / `orders` / `order_items` schema; relies on existing `products_active_idx` and `orders_customer_idx` (`001_commerce.sql:167-168`).

### RPC `get_personalized_picks`

```sql
create or replace function public.get_personalized_picks(
  p_customer_id uuid,
  p_limit int default 8,
  p_exclude_slug text default null
) returns table (slug text, score int, reason text)
language sql security definer set search_path = public as $$
  -- CTEs: customer_orders (payment_status in ('paid','payment_started') → paid preferred),
  --       item_slugs (from order_items where order_id in customer_orders),
  --       category_counts / occasion_counts (from products join, unnest occasions),
  --       buy_again (frequency of item_slugs where products.active, ordered by count desc),
  --       affinity  (products.active and slug not in buy_again and not p_exclude_slug,
  --                  score = category affinity*2 + occasion affinity, ordered by score desc, then created_at desc)
  --       fallback  (newest active products)
  -- Returns buy_again rows with reason 'buy_again' then affinity rows then fallback to fill p_limit.
$$;
```

- `p_limit` clamped 1..12 in TS before call; `p_exclude_slug` used by detail page.
- `reason` enum `buy_again | affinity | fallback_newest` lets provider split into `{ buyAgain, recommended }`.
- Security definer is safe because route asserts `p_customer_id = auth.uid()` before calling; RPC never exposes PII, only slugs/scores.
- If RPC returns < `p_limit`, provider pads with `newest` so UI contract is always fill.

## Feature module

`features/personalization/` layout:

- `types.ts` — `PersonalizationPicks { buyAgain: Product[]; recommended: Product[]; reason: 'history'|'fallback' }`, `PersonalizationQuery { limit?: number; excludeSlug?: string; locale: Locale }`.
- `scoring.ts` — pure `scoreAffinity(products, orderItems, wishlistSlugs): Map<slug, score>` for local fallback and unit tests (mirrors SQL weights: category 2, occasion 1). No DB import.
- `local-repository.ts` — implements `PersonalizationRepository { getPicks(customerId, query): Promise<PersonalizationPicks> }` over `features/catalog/data.ts` seed + in-memory order history stub.
- `supabase-repository.ts` — calls `supabase.rpc('get_personalized_picks', { p_customer_id, p_limit, p_exclude_slug })`, then `from('products').select(...).in('slug', slugs).eq('active', true)` and reorders to RPC order via `row-mappers`.
- `provider.ts` — `getPersonalizationProvider()` env switch; exports `getPicks` used by server components and API route.
- `wishlist-sync.ts` — `syncWishlistOnLogin(supabase, customerId, slugs: string[])` — validates slugs exist (`products.active`), deletes stale rows not in input, inserts missing (single transaction via `rpc` or `delete+insert` with FK guard). Idempotent.
- `analytics.ts` — stub `trackPersonalization(event, payload)` (no-op) emitting `personalization_impression` / `personalization_click` for future dashboard; keeps call sites stable.

No edits to `features/catalog/catalog-utils.ts` or `features/order/*`; import `Product` as read-only.

## API

### `GET /api/personalization/picks?limit=8&excludeSlug=rose-hour&locale=en`

- Auth: `auth.getUser()` via `@supabase/ssr`; anonymous → `401` body `{ buyAgain:[], recommended:[] }` so client can hide carousels without error toast.
- Validation: zod `z.object({ limit: z.coerce.number().int().min(1).max(12).default(8), excludeSlug: z.string().max(80).optional(), locale: z.enum(['en','ar','fr']).default('en') })`.
- Flow: `customerId = user.id` → `provider.getPicks(customerId, query)` → returns locale-mapped products (uses `nameAr/nameFr` selection already in row-mappers).
- Cache: `Cache-Control: private, max-age=60` + `ETag: W/"customerId:limit:excludeSlug"`; no CDN. Errors logged via structured logger, fallback to `newest` (never 5xx to UI).
- Rate: per-user soft limit 60/min (reuse existing route limiter pattern if present, else in-memory); anonymous gets `max-age=0`.

### `POST /api/wishlist/sync` body `{ slugs: string[] }`

- Auth required; zod `z.array(z.string().max(80)).max(50)`.
- Validates slugs against `products.active`; drops unknown.
- Writes via service-role client passed from route (RLS bypass, route is auth gate). Transactional: `delete from wishlist_items where customer_id = auth.uid() and product_slug not in (...); insert missing`.
- Returns `{ synced: number }`. Rate-limit 10/min per `customer_id` (reuse `lib/cron.ts` helper style).

Wiring: `features/wishlist/WishlistProvider.tsx` adds `useEffect` on `user != null` to read `readWishlist()` (localStorage) and `fetch('/api/wishlist/sync', { method:'POST', body: JSON.stringify({ slugs }) })` once per login session (dedup via sessionStorage flag).

## UI/UX

Route integration (server components with Suspense):

- `app/[locale]/shop/page.tsx` — above `CatalogToolbar` / `CatalogGrid`: `const picks = user ? await getPersonalizationProvider().getPicks(user.id, { limit:8, locale }) : null` in a `Suspense` boundary with `PersonalizationSkeleton` fallback (3 shimmer cards). Renders `BuyAgainStrip` then `RecommendedCarousel` when `picks != null` and at least one array non-empty (provider always pads, so renders unless fallback disabled by flag).
- `app/[locale]/shop/[slug]/page.tsx` — below add-ons/gift note: `RecommendedCarousel` with `excludeSlug = params.slug`, single carousel, no BuyAgain on detail.

Components `features/personalization/components/`:

- `BuyAgainStrip.tsx` — props `{ products: Product[]; locale }`; horizontal scroll (flex snap) on mobile, 4-up grid on desktop; reuses `features/catalog/ProductCard.tsx` small variant; header `dictionary.personalization.buyAgain` ("Buy again" / "اشترِ مجددًا" / "Acheter à nouveau"), sub "Your favorites, ready to reorder".
- `RecommendedCarousel.tsx` — props `{ products: Product[]; locale; titleKey }`; 2-row carousel on desktop, swipe on mobile; header `recommendedForYou` with affinity hint e.g. "Because you loved Hand Bouquets" derived from top category in scoring (locale-mapped via `features/catalog/catalog-labels.ts`).
- `PersonalizationSkeleton.tsx` — 3-card shimmer matching `ProductCard` dimensions.

Design tokens: no new palette; uses `app/globals.css` semantic variables (warm ivory surface, deep green primary, terracotta accent, hairline borders). Layout via logical CSS (`margin-inline`, `inset-inline`) so Arabic RTL (`rosette.locale.v1` → `dir=rtl`) mirrors automatically. Eyebrow in sage, title in Fraunces, cards with existing radii/shadows.

States:

- Loading: skeleton (never blocks catalog grid).
- Authenticated with history: both strips; click navigates to product detail (existing routing) and fires `trackPersonalization('click')`.
- Authenticated without history or anonymous: components hidden or fallback newest (provider pads, but route returns empty for anonymous → hidden to avoid implying history).
- Error: silent degrade to newest; logger records, no user toast except wishlist sync failure (sonner).

a11y: carousel `aria-label` from dictionary, roving tabindex, keyboard ArrowLeft/Right scroll, card `alt` from localized name, hit-target ≥44px, focus ring via design system.

i18n: ~10 keys added to `features/i18n/dictionaries.ts` (`personalization.buyAgain`, `personalization.recommendedForYou`, `personalization.becauseYouLoved`, `personalization.quickAdd`, ... ) with en/ar/fr (reuse existing `nameAr/nameFr` on Product for card titles).

## Error handling, privacy, performance

- **Fallbacks:** RPC timeout / Supabase unreachable → `supabase-repository` catches and delegates to `local-repository` with `sortProducts(..., 'newest')` (`catalog-utils.ts:33`) so storefront never blocks. Invalid `p_customer_id` → empty picks → UI hidden.
- **Validation:** All query/body params via zod; `p_limit` clamped; `excludeSlug` sanitized; slugs length 80.
- **Privacy:** Only authed `auth.uid()` reads own rows; RPC is auth-gated; no view tracking means no retention policy needed. `wishlist_items` cascades on `profiles` delete; clear via `DELETE` or `POST { slugs: [] }`. No PII in RPC output.
- **Performance:** Hydration ≤12 products per request; single RPC + single `select ... in (slugs)`; `private, max-age=60` limits repeated calls; `cf:build` size budget unchanged (no new deps). `paginateProducts` unchanged.
- **Flags:** env `ROSETTE_PERSONALIZATION_ENABLED` (default true for authed). When false, provider returns empty without RPC.

## Testing

TDD order by risk — scoring first.

| File | Covers |
| --- | --- |
| `tests/domain/personalization-scoring.test.ts` | `scoreAffinity` weights (category 2 ×, occasion 1 ×), buy-again frequency, tie-break `createdAt`, `p_exclude_slug` exclusion, active filter |
| `tests/domain/personalization-validation.test.ts` | zod schemas (`limit`, `excludeSlug`, wishlist `slugs` max 50, locale) |
| `tests/domain/wishlist-sync.test.ts` | upsert idempotency, drop unknown slug, delete stale, cascade |
| `tests/domain/personalization-repository.test.ts` | supabase-repository fakes: RPC → hydrates in RPC order, pads with newest when < limit, RLS rejection for foreign customer_id |
| `tests/routes/personalization-picks.test.ts` | 401 anonymous, 200 authed, ETag, fallback on RPC throw, `ROSETTE_PERSONALIZATION_ENABLED=false` short-circuit |
| `tests/routes/wishlist-sync.test.ts` | 401, 200, rate-limit 429, unknown slugs dropped |
| `tests/components/PersonalizationCarousels.test.tsx` | renders buy-again + recommended, skeleton, hidden when empty, excludeSlug, RTL aria |

Injectable `SupabaseClient` fake keeps network out of tests, as with `features/wishlist` and `features/payment` fakes. `npm run lint` (`tsc --noEmit && eslint .`) and `vitest run` remain green gates.

## Rollout & observability

- Migration `029_personalization.sql` is additive; deploy with existing Supabase migration flow (no downtime, no backfill).
- Feature flag via env; log `personalization.picks.served { customerId, buyAgainCount, recommendedCount, reason }` at `info`, and `personalization.sync.completed` / `failed` mirroring `features/wishlist/wishlist-cron.ts` style.
- Metrics stub in `analytics.ts`; dashboard can query `personalization_impression` once enabled.
- Upgrade path to view-history: add `product_view_events` table, extend RPC with a `view_affinity` CTE, and call `POST /api/personalization/view` from `shop/[slug]` — no UI contract change.

## Success criteria

- Seeded authed user (≥1 paid order, Cairo) sees `Buy again` containing most-frequent slug and `Recommended` containing same-category not-yet-purchased products; anonymous sees no strips.
- `POST /api/wishlist/sync` correctly persists localStorage wishlist and subsequent `GET /api/personalization/picks` reflects wishlist-affinity.
- `p_exclude_slug` removes current product from detail recommendations.
- With no history, picks pad with `newest` and still render; with Supabase down, UI falls back without blocking catalog.
- `npm run lint` and full `vitest run` stay green; `wrangler.jsonc` unchanged.
