# Spec — Product reviews & ratings

Date: 2026-08-18

## Goal

Let customers who actually bought a product rate it 1–5 stars with a short
review, show approved reviews and aggregate ratings on the storefront
(product cards + product page), and give admins a moderation queue before
anything goes live.

## Decisions (locked with the user)

- **Verified purchase only** — a signed-in customer may review a product
  only if they have an order containing it with `payment_status = 'paid'`.
  One review per (order, product).
- **Approve first** — reviews are created `pending` and only appear on the
  storefront once an admin approves them. Admins can also reject (hide).
- Rating scale 1–5. Review body is free text, single field, max 400 chars,
  stored as authored (no per-locale translation). The customer's locale is
  not stored; the body is displayed as-is.
- Out of scope: Review JSON-LD, review photos, helpful-votes, review
  editing/deletion by customers, ratings for city delivery pages.

## Data model — migration `010_product_reviews.sql`

```sql
create table if not exists public.product_reviews (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  -- Nullable only so the seed can ship demo reviews without fabricating
  -- profiles/orders; every real review sets both.
  order_id uuid references public.orders(id) on delete cascade,
  customer_id uuid references public.profiles(id),
  rating integer not null check (rating between 1 and 5),
  body text not null check (char_length(body) between 1 and 400),
  status text not null default 'pending' check (status in ('pending', 'approved')),
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (order_id, product_id)
);

create index if not exists product_reviews_product_idx on public.product_reviews(product_id);
create index if not exists product_reviews_status_idx on public.product_reviews(status);
create index if not exists product_reviews_customer_idx on public.product_reviews(customer_id);

alter table public.product_reviews enable row level security;

-- Storefront (anon): approved reviews are readable by everyone.
create policy "anyone reads approved reviews" on public.product_reviews
  for select using (status = 'approved');

-- Customers may read their own rows (e.g. to see a pending review).
create policy "customers read own reviews" on public.product_reviews
  for select using (customer_id = auth.uid());
```

No insert/update policies: creation runs through the service-role client
(verified-purchase + duplicate checks happen in the API route) and
moderation through the service-role client — the same boundary the
cancellation feature uses. A rejected review is a hard delete (admin
rejects → row deleted), so `status` only needs `pending`/`approved`.

**Why no `rejected` status:** the queue treats reject as delete. Keeping
two statuses avoids an unbounded pile of hidden rows and matches the
"approve or it never existed" mental model. Deleting is safe because the
row carries no other references.

## Pure logic — `features/reviews/review-rules.ts`

```ts
export type ReviewSubmitEligibility = 'ok' | 'not_verified' | 'already_reviewed';

export function isEligibleOrderPayment(paymentStatus: string): boolean;
// true only for 'paid'

export function canSubmitReview(input: {
  hasPaidOrderForProduct: boolean;
  alreadyReviewed: boolean;
}): ReviewSubmitEligibility;

export function clampRating(value: unknown): number;
// Number(value), NaN or out-of-range → 0 (route rejects 0 as invalid)

export function cleanReviewBody(value: unknown): string | null;
// String trim, null if empty or longer than 400 chars
```

- Eligibility check in the API route: the customer has an order with
  `payment_status = 'paid'` containing the product (via `order_items`
  matching `product_id` OR `product_slug`), and no existing row for
  (order_id, product_id). Only one such order is needed to satisfy the
  check; the first matching paid order is used as the review's `order_id`.
- Storefront aggregates count **approved** reviews only.

## Storefront

### Product page — `ProductReviews` server component

Rendered below `ProductDetail` on `app/[locale]/[city]/shop/[slug]/page.tsx`
(after `ProductJsonLd`/header, inside the same main). Reads via the anon
client (RLS: approved rows visible to everyone). Sections:

1. **Aggregate header** — `★ 4.8 · 12 reviews`, plus a 1–5 breakdown with
   counts. Hidden entirely when there are no approved reviews.
2. **Review list** — approved reviews, newest first: rating stars, body,
   reviewer display name (from `profiles.display_name`), date.
3. **Review form** — client component `ReviewForm`:
   - Not signed in → "Sign in to review" link to the account login.
   - Signed in but not verified for this product → "Reviews are reserved
     for verified purchases" notice.
   - Verified + not yet reviewed → star picker (1–5) + textarea (max 400)
     + submit → `POST /api/account/products/[slug]/reviews`; on 201 show
     "Thanks — your review is pending approval."
   - Already reviewed → "You've reviewed this product" notice.
   - Server-side knowledge (signed in? verified? already reviewed?) comes
     from a small server check passed as props into the client form.

### Product cards + product page rating line

`features/catalog/types.ts` `Product` gains an optional
`rating?: { average: number; count: number }`. Both catalog repository
impls (`local-repository.ts`, `supabase-repository.ts`) always populate it
via a shared pure helper (absent means `{ average: 0, count: 0 }`), and the
storefront renders the rating line only when `count > 0`. Both impls
compute the aggregate from **approved** reviews:

- Local: aggregate over a demo `reviews` array added to the local catalog
  data module (`features/catalog/data.ts`), keyed by product slug.
- Supabase: `product_reviews` filtered `status = 'approved'` grouped by
  `product_id` (avg + count), merged into `list()` and `getBySlug()`.

`ProductCard` and `ProductDetail` show `★ {average.toFixed(1)} · {count}` when
`count > 0` (small, muted, under the title/price). `ProductDetail` gets it
from the same `Product` object.

## API

`POST /api/account/products/[slug]/reviews`

- Auth: `getCurrentCustomer()` → 401 when absent.
- Body: `{ rating, body }` — validated with `clampRating`/`cleanReviewBody`
  → 400 on invalid.
- Look up product by slug → 404 when missing.
- Verified-purchase check (service-role client):
  `orders` joined to `order_items` where `customer_id = customer.id`,
  `payment_status = 'paid'`, and `order_items.product_id = product.id` or
  `order_items.product_slug = slug`, newest order first, `.limit(1)`.
- Duplicate check: existing `product_reviews` for `(order_id, product_id)`
  → 409 `already_reviewed`. (The unique constraint backs this up; the
  route check produces a clean error instead of a raw constraint violation.)
- Insert `{ product_id, order_id, customer_id, rating, body, status: 'pending' }`
  via service-role client → 201 `{ ok: true, status: 'pending' }`.
- No email for new reviews (admins see them in the queue).

## Admin

`/admin/reviews` — mirrors the cancel-requests queue:

- Tabs **Pending / Approved** with counts (`?status=approved`), server-side.
- Pending rows: product name linking to `/admin/products/[id]`, customer
  (email + display name), rating stars, body, requested date, and inline
  **Approve** / **Reject** actions.
  - Approve → `POST /api/admin/reviews/[id]` `{ action: 'approve' }` →
    row `approved` (sets `reviewed_by`, `reviewed_at`).
  - Reject → `{ action: 'reject' }` → row deleted.
- Approved rows: same fields minus actions, plus reviewer + review date.
- `AutoRefresh` mounted (new reviews appear without reload).
- Sidebar entry `{ href: '/admin/reviews', key: 'reviews' }`.
- Admin page + route are `getCurrentAdmin`-gated (403 via existing pattern).

`POST /api/admin/reviews/[id]` (service-role, `getCurrentAdmin` guard):
- `approve` → update status/reviewed_by/reviewed_at; missing row → 404.
- `reject` → delete row; missing row → 404.
- Invalid action → 400.

## i18n keys (EN / AR / FR)

`reviews` ('Reviews'), `rating` ('Rating'), `writeReview` ('Write a review'),
`reviewPlaceholder` ('How was it?'), `submitReview` ('Submit review'),
`reviewPending` ('Thanks — your review is pending approval.'),
`reviewSignInPrompt` ('Sign in to review'), `verifiedPurchaseOnly`
('Reviews are reserved for verified purchases.'), `alreadyReviewed`
('You've reviewed this product.'), `reviewCount` ('{count} reviews'),
`reviewAverage` ('{average} · {count} reviews'), `approveReview` ('Approve'),
`rejectReview` ('Reject'), `noReviews` ('No reviews yet.'),
`noPendingReviews` ('No reviews waiting for approval.'),
`verifiedCustomer` ('Verified customer' — storefront fallback name when a
seed review has no customer profile).

## Seed

`supabase/seed.sql` gains a `product_reviews` block: 8–10 **approved**
reviews spread across products (varied ratings, short EN bodies) with fixed
ids, `order_id`/`customer_id` **null** (demo content), `product_id`
resolved by subquery on `products.slug`, and `on conflict (id) do update`
like the rest of the seed. No pending reviews in seed (the queue starts
empty). The storefront falls back to the `verifiedCustomer` label for the
reviewer name. The local demo catalog (`features/catalog/data.ts`) gains a
parallel small `demoReviews` array (same slug keys) so the local repository
has aggregates to show.

## Out of scope

- Review JSON-LD / schema.org markup.
- Photos/videos in reviews, helpful-votes, sort/filter controls.
- Customer edit/delete of their own reviews.
- Ratings on city delivery pages or blog posts.
- Email notification when a review is approved.

## Tests

- `tests/domain/review-rules.test.ts` — `isEligibleOrderPayment`,
  `canSubmitReview` (all eligibility branches), `clampRating` (valid,
  NaN, bounds), `cleanReviewBody` (trim, empty, >400).
- `tests/domain/catalog-repository.test.ts` (extend) — local impl returns
  aggregates from the demo reviews; supabase fake returns avg/count from
  approved rows only.
- `tests/domain/reviews-repository.test.ts` (new, if a repo module is
  introduced) — list/aggregate queries over the fake client.
- `tests/components/ReviewForm.test.tsx` — renders the star picker +
  textarea, posts `{ rating, body }`, shows the pending-success message,
  shows the already-reviewed notice when passed that prop.
- Full gate: `npm test`, `npm run lint` (`tsc --noEmit`), `npm run build`.

## Phases

1. Migration `010` + pure `review-rules.ts` (TDD).
2. Catalog aggregates: types + both repository impls (TDD).
3. API routes: customer submit + admin approve/reject (TDD on the service
   layer with fakes).
4. Storefront: `ProductReviews` + `ReviewForm` + rating lines on card/detail.
5. Admin: `/admin/reviews` queue + sidebar + `AutoRefresh`.
6. i18n keys, seed block, full gate, review, merge.
