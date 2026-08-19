# Spec — Wishlist / favorites

Date: 2026-08-18

## Goal

Let shoppers save products they like with a heart toggle on product cards and
the product page, view their saved items on a wishlist page, and see a
wishlist count in the header. Guests save to localStorage; signed-in
customers' saves live in the database and are merged from the guest list on
sign-in. A cron watches saved products and emails owners when a saved
product's price drops or comes back in stock.

## Decisions (locked with the user)

- **Guests + signed-in** — the heart works for everyone. Guests' saves live
  in `localStorage` (slug-keyed, mirroring the cart's storage module);
  signed-in saves are rows in `wishlist_items`. On sign-in the guest list is
  merged into the account and cleared; the server list becomes the source of
  truth.
- **Header wishlist count** — a small count pill in the header linking to
  the wishlist page, driven by the client wishlist state (guests and
  signed-in alike).
- **Price-drop / back-in-stock emails** — a cron (`/api/cron/wishlist`,
  CRON_SECRET-guarded like `/api/cron/notifications`) compares each saved
  product's current lowest price and total available stock against a stored
  snapshot on the row, emails on the transition, then updates the snapshot
  so an item only notifies once per change.
- The wishlist is product-level (slug), not variant-level — saving a product
  saves all its variants. The heart appears on `ProductCard` and the product
  page.
- Out of scope: sharing/registry features, notifying on new category
  arrivals, admin wishlist views, sorting the wishlist beyond recency.

## Data model — migration `012_wishlist.sql`

```sql
create table if not exists public.wishlist_items (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  created_at timestamptz not null default now(),
  -- Language the customer was browsing when they saved (email language).
  locale text not null default 'en' check (locale in ('en', 'ar', 'fr')),
  -- Snapshots for the price-drop / back-in-stock cron (minor units / units).
  -- Default -1 = "uninitialized": the first cron run records real values and
  -- never emails (a real price >= 0 is never a drop from -1, and -1 stock is
  -- never a restock; a genuine restock fires only from a snapshot of 0).
  last_price_minor integer not null default -1,
  last_available_stock integer not null default -1,
  unique (customer_id, product_id)
);

create index if not exists wishlist_items_customer_idx on public.wishlist_items(customer_id);
create index if not exists wishlist_items_product_idx on public.wishlist_items(product_id);

alter table public.wishlist_items enable row level security;

-- Customers may read their own rows (wishlist page). Writes are
-- service-role only.
create policy "customers read own wishlist" on public.wishlist_items
  for select using (customer_id = auth.uid());
```

No insert/delete policies: saves, removals, and the merge all run through
the service-role route, which validates the product exists and dedupes —
the same boundary the reviews and change-requests features use. The
`unique (customer_id, product_id)` constraint backs the idempotent insert
(`onConflict do nothing`). (The delete policy is deliberately absent: the
client never touches anon writes, so a policy would be dead surface.)

## Guest storage — `features/wishlist/storage.ts`

Mirrors `features/cart/storage.ts`:

```ts
const STORAGE_KEY = 'rosette.wishlist.v1';
export function readWishlist(): string[];    // slug array, invalid → [] (and clears)
export function writeWishlist(slugs: string[]): void;
export function clearWishlistStorage(): void;
```

Slugs are the stable key: they match the storefront's slug-keyed catalog
(local demo + Supabase), survive variant changes, and dedupe naturally.

## Client — `features/wishlist/WishlistProvider.tsx`

Mounted in `app/layout.tsx` next to `CartProvider` (inside `I18nProvider`).
Exposes `{ ready, saved: string[], isSaved(slug), toggle(slug), count }`.

- **Signed-in detection:** the established browser pattern —
  `getBrowserSupabase().auth.getUser()` on mount (same as
  `SignedInNotice`).
- **Guest:** state = `readWishlist()`; `toggle` updates state + localStorage
  immediately (optimistic, no server call).
- **Signed-in:** on mount — read the guest list; if non-empty, `POST
  /api/account/wishlist/merge` with the guest slugs, then clear guest
  storage; state = the returned server slug list. `toggle` optimistically
  updates state, then `POST /api/wishlist/items` (add) or `DELETE
  /api/wishlist/items/[slug]` (remove); on failure the optimistic change
  is reverted. The server list is fetched on every sign-in state change
  (sign-in and sign-out both re-sync).
- Both save routes send the customer's current browsing language (`locale`
  from the i18n context), stored on the wishlist row — it becomes the
  language of the price-drop / back-in-stock emails.
- No double-toggles: `toggle` is a no-op while the previous call for the
  same slug is in flight.

## Storefront

### Heart toggle — `components/wishlist/WishlistHeart.tsx` (client)

- Props `{ slug: string }` (optionally `{ size }`). Renders a heart button
  (lucide `Heart` filled when saved) with `aria-pressed` and an accessible
  label (`addToWishlist` / `removeFromWishlist`), using the provider.
- Mounted on `ProductCard` (corner of the card, small) and on the product
  page next to the add-to-bag control.
- The card heart must not trigger the card's navigation link (stop
  propagation).

### Header count — `components/wishlist/WishlistLink.tsx` (client)

- Renders a link to the wishlist page (`href('/wishlist')` via
  `useStorePath`) with the provider count as a pill — same style as the bag
  count in `SiteHeader`. Dropped into `SiteHeader` next to the bag link and
  into the mobile sheet.
- `aria-label` uses `wishlist` key with the count.

### Wishlist page — `app/[locale]/[city]/wishlist/page.tsx`

One page for both guest and signed-in:

- Server component renders the page shell (eyebrow/title via existing
  `getServerT`), then a client `WishlistPageContent`:
  - Reads `saved` from the provider.
  - Fetches product-card data from `GET /api/wishlist/products?slugs=…`
    (public, catalog-backed — works for the local demo catalog too).
  - Renders the saved `ProductCard`s in a grid (with hearts), or an empty
    state ("Nothing saved yet" + browse link, reusing the existing empty
    collection pattern).
  - A "clear" affordance is out of scope; individual hearts remove items.
- Linked from `AccountNavItem` (account menu) as well.

## API

- `POST /api/wishlist/items` — body `{ slug, locale? }` (`locale` is one of
  `en|ar|fr`, defaults `en`); `getCurrentCustomer()` → 401 for guests (the
  client never calls it signed out). The client is slug-only, so the route
  resolves slug → product id (like the reviews submit route), then
  service-role inserts with `onConflict('customer_id,product_id').doNothing()`
  → 200 `{ saved: true }` (idempotent — re-saving is a no-op; unknown slug
  → 404).
- `DELETE /api/wishlist/items/[slug]` — `getCurrentCustomer()` → 401;
  resolve slug → id, service-role delete → 200. Missing row → 200 anyway
  (idempotent).
- `POST /api/account/wishlist/merge` — body `{ slugs: string[], locale? }`;
  `getCurrentCustomer()` → 401. Resolves slugs to product ids (Supabase
  `products.in('slug', slugs)`), service-role inserts the missing rows
  (`onConflict` ignore), returns `{ slugs: string[] }` — the full server
  list — so the provider can sync and clear guest storage.
- `GET /api/wishlist/products?slugs=a,b,c` — public; `list({})` from the
  catalog repository filtered to the requested slugs (cap 50, 400 above),
  mapped to a card shape: `{ slug, name, nameAr?, nameFr?, price, imageUrl,
  rating?, inventory }` (inventory > 0 → "in stock" signal for the page).
  Works for both repository implementations (local demo + Supabase).

## Price-drop / back-in-stock cron

`app/api/cron/wishlist/route.ts` — GET+POST, `isCronAuthorized` with
`CRON_SECRET` (mirrors `/api/cron/notifications`).

**Pure detection — `features/wishlist/price-watch.ts` (tested):**

```ts
export type PriceWatchInput = {
  product: { id: string; priceMinor: number; variants: Array<{ priceDeltaMinor: number; active: boolean; inventory?: Array<{ quantity: number; reserved_quantity: number }> }> };
  lastPriceMinor: number;
  lastAvailableStock: number;
};
export type PriceWatchResult =
  | { type: 'none' }
  | { type: 'price_drop'; oldMinor: number; newMinor: number }
  | { type: 'back_in_stock' }
  | { type: 'price_drop_and_back_in_stock'; oldMinor: number; newMinor: number };

export function currentPriceMinor(product: PriceWatchInput['product']): number;
// min(base + delta) over active variants; base price when there are no
// active variants
export function currentAvailableStock(product: PriceWatchInput['product']): number;
// Σ (quantity - reserved_quantity) over active variants; 0 when there are
// no active variants (a product gaining its first variant later fires
// back_in_stock, which is the desired signal)
export function evaluateWishlistWatch(input: PriceWatchInput): PriceWatchResult;
// stock 0 → >0 = back_in_stock; new price < last = price_drop (both can fire)
```

The cron loop (service `features/wishlist/wishlist-cron.ts`, tested with a
fake client + mailer):

1. Load all `wishlist_items` with their product + variants + inventory
   (`wishlist_items(product_id, locale, last_price_minor,
   last_available_stock, profiles(email), products(id, price_minor,
   product_variants(id, price_delta_minor, active, inventory(quantity,
   reserved_quantity)))`).
2. For each row, run `evaluateWishlistWatch`; for each fired type, send the
   email (below) to the customer's email (join `profiles`), best-effort per
   item — a send failure never aborts the run.
3. Update every row's snapshot to the current values
   (`last_price_minor`, `last_available_stock`), so an item only notifies on
   the transition (a product that stays in stock or at the same price never
   re-notifies; going out and back in stock notifies again).

Because the migration defaults both snapshots to `-1` ("uninitialized"),
the **first run only records snapshots and never emails** — a real price
(≥ 0) is never a drop from −1, and a −1 stock is never a restock. A genuine
restock fires only from a snapshot of `0`, i.e. a product the cron previously
observed out of stock — so a product in stock on day one never triggers a
back-in-stock email, but a product that later goes out and comes back does.
No mass email on deploy.

**Email — `features/wishlist/email.ts`:** direct-to-mailer, not the
order-shaped `notification_deliveries`/retry machinery (those re-render from
an order row; product emails have no order). `sendWishlistEmail({ to,
locale, type, productName, priceMinor?, productUrl })` builds subject + text
+ HTML (reusing the `escapeHtml` + money formatting conventions from
`email-templates.ts`) and sends via `createGmailTransport()`. The email
language is the `locale` stored on the wishlist row at save time (the
customer's browsing language), falling back to `en`. Subjects:
`wishlist_price_drop` ("A flower you saved just dropped in price"),
`wishlist_back_in_stock` ("Back in stock: {product}" / localized). Link back
to the product page in the storefront.

## i18n keys (EN / AR / FR)

`wishlist` ('Wishlist'), `addToWishlist` ('Add to wishlist'),
`removeFromWishlist` ('Remove from wishlist'), `wishlistEmpty`
('Nothing saved yet.'), `wishlistEmptyHint` ('Save flowers you like with the
heart on any product.'). Reuses existing `browseCollection`, `from`, and the
storefront nav keys. Email subjects live in `features/wishlist/email.ts`
(not the storefront dictionaries — they're not rendered in the app).

## Out of scope

- Sharing/registry/gift-list features, occasion calendars.
- Notifications for new arrivals in a saved category.
- Variant-level saves, wishlist sorting beyond recency, batch "clear all".
- Admin wishlist views or metrics.

## Tests

- `tests/domain/wishlist-storage.test.ts` — read/write/clear, invalid JSON,
  version mismatch (jsdom localStorage, mirroring cart-storage tests).
- `tests/domain/price-watch.test.ts` — `currentPriceMinor` (base only,
  variants, inactive variants skipped), `currentAvailableStock` (sum
  quantity − reserved, inactive skipped), `evaluateWishlistWatch` (none,
  price_drop, back_in_stock, both, no-repeat when unchanged).
- `tests/domain/wishlist-cron.test.ts` (fakes) — loads rows, fires the right
  emails, updates snapshots, send failure doesn't abort the loop.
- `tests/components/WishlistHeart.test.tsx` — guest toggle writes
  localStorage; signed-in toggle POSTs/DELETEs and reverts on failure.
- `tests/components/WishlistLink.test.tsx` — renders count + link.
- Full gate: `npm test`, `npm run lint`, `npm run build`.

## Phases

1. Migration `012` + `wishlist/storage.ts` (TDD).
2. `price-watch.ts` pure detection (TDD).
3. Routes: `POST/DELETE /api/wishlist/items`, merge, public products lookup
   (TDD on a small service with fakes).
4. `WishlistProvider` + `WishlistHeart` + `WishlistLink` + header/card
   wiring (component tests).
5. Wishlist page (server shell + client grid) + account nav link.
6. `wishlist-cron.ts` + `/api/cron/wishlist` + `email.ts` (TDD).
7. i18n keys, full gate, final review, merge (SDD with isolated worktree).
