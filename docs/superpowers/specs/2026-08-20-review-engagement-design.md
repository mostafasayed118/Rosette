# Spec — Review engagement: JSON-LD, helpful-votes, photos

Date: 2026-08-20

## Goal

Deepen the existing product-reviews feature with the three items that were
explicitly deferred in `2026-08-18-product-reviews-design.md`:

1. **Review JSON-LD** — schema.org `aggregateRating` + `review` markup on the
   product page so Google can render review rich snippets.
2. **Helpful-votes** — a single "Helpful" toggle on each approved review with a
   live count.
3. **Review photos** — let verified buyers attach up to 3 photos to a review,
   moderated with the review itself and shown once approved.

## Decisions (locked with the user)

- **Photo storage** — server-route upload into a **public** Supabase Storage
  bucket (`review-images`) under unguessable random paths. The browser never
  holds storage keys; uploads go through a new auth-gated API route. Photos
  render only when their review is `approved`; visibility is gated by not
  rendering the URL until approval (same model the app already uses for
  product images). The public-URL-for-bytes tradeoff is accepted.
- **Helpful-vote identity** — hybrid. Signed-in votes dedupe on
  `customer:<id>`; guest votes dedupe on `visitor:<uuid>` (client-generated,
  stored in `localStorage` under `rosette.visitor.v1`). Up-only "Helpful"
  toggle (not up/down).

## Data model — migration `014_review_engagement.sql`

```sql
alter table public.product_reviews
  add column photos jsonb not null default '[]'::jsonb;

create table if not exists public.review_votes (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.product_reviews(id) on delete cascade,
  -- 'customer:<uuid>' for signed-in votes, 'visitor:<uuid>' for guests.
  voter_key text not null,
  created_at timestamptz not null default now(),
  unique (review_id, voter_key)
);

create index if not exists review_votes_review_idx on public.review_votes(review_id);

alter table public.review_votes enable row level security;
-- No policies: all reads/writes go through the service-role client. Vote
-- counts are served via the public API route, not anon RLS.

-- Public bucket for review photos (no-op if it already exists).
insert into storage.buckets (id, name, public)
values ('review-images', 'review-images', true)
on conflict (id) do nothing;
```

`review_votes` uses a single `voter_key` column rather than two nullable
FK columns so the `unique (review_id, voter_key)` constraint dedupes correctly
for both audiences (Postgres treats NULLs in a unique index as distinct, which
would have let a signed-in vote and a guest vote coexist on separate columns).

## Pure logic

### `features/reviews/vote-service.ts`

```ts
export type VoteState =
  | { status: 'ok'; helpful: number; voted: boolean }
  | { status: 'not_found' };

export function customerVoterKey(customerId: string): string;   // 'customer:<id>'
export function visitorVoterKey(visitorId: string): string;     // 'visitor:<id>'

export async function getVoteState(client, input: { reviewId: string; voterKey: string }): Promise<VoteState>;
// 'ok' → helpful = count of review_votes for reviewId; voted = a row exists
// for voterKey. 'not_found' when the review does not exist.

export async function toggleVote(client, input: { reviewId: string; voterKey: string }): Promise<VoteState>;
// If a row exists for (reviewId, voterKey) → delete it; else insert it.
// Re-count after mutation and return the fresh state. 'not_found' when the
// review does not exist.
```

### `features/reviews/review-storage.ts`

```ts
export type ReviewPhotoInput = { name: string; type: string; size: number; bytes: ArrayBuffer };
export type ReviewPhotoValidation = { ok: true; photos: ReviewPhotoInput[] } | { ok: false; reason: 'too_many' | 'too_large' | 'invalid_type' };

export const REVIEW_PHOTO_MAX = 3;
export const REVIEW_PHOTO_MAX_BYTES = 5 * 1024 * 1024; // 5 MB
export const REVIEW_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export function validateReviewPhotos(files: ReviewPhotoInput[]): ReviewPhotoValidation;
// Reject >3 files, any file >5 MB, or any MIME type outside the allow-list.

export async function uploadReviewPhotos(storage, files: ReviewPhotoInput[]): Promise<{ urls: string[] }>;
// Uploads each file to 'review-images/<uuid>.<ext>' and returns the public URL.
// <ext> is derived from the MIME type, never from the client filename.

export function isReviewImageUrl(url: string): boolean;
// True only for URLs on the review-images public bucket (path contains
// '/storage/v1/object/public/review-images/').
```

## JSON-LD

`features/seo/product-jsonld.ts` — `buildProductJsonLd` gains an optional
`reviews` argument:

```ts
export type JsonLdReview = { rating: number; body: string; createdAt: string; displayName?: string | null };
export function buildProductJsonLd(product: Product, reviews?: JsonLdReview[]);
```

The returned Product node additionally carries:

- `aggregateRating: { '@type': 'AggregateRating', ratingValue, reviewCount }`
  from `product.rating` when `product.rating.count > 0` (both catalog repos
  already populate `rating`).
- `review: [...]` — up to 10 `{ '@type': 'Review', author: { '@type':
  'Person', name }, reviewRating: { '@type': 'Rating', ratingValue },
  reviewBody, datePublished }` nodes for the approved reviews passed in.

The product page (`app/[locale]/[city]/shop/[slug]/page.tsx`) fetches the
approved reviews once and passes them to both `ProductJsonLd` and
`ProductReviews` so the review data is not queried twice.

### Shared fetch — `features/reviews/get-approved-reviews.ts`

```ts
export type ApprovedReview = { id: string; rating: number; body: string; createdAt: string; displayName?: string | null };
export type ApprovedReviewData = { productId: string | null; reviews: ApprovedReview[]; aggregate: ReviewAggregate };
export async function getApprovedReviews(productSlug: string): Promise<ApprovedReviewData | null>;
// Looks up the product by slug; if missing returns null. Otherwise fetches
// approved reviews (id, rating, body, created_at, profiles(display_name))
// newest first, and computes the aggregate with ratingBySlug. Returns null
// reviews array + { average: 0, count: 0 } aggregate when there are none.
```

`ProductReviews` is refactored to accept `data: ApprovedReviewData` (plus
`productSlug` and `locale`) instead of running the product lookup + review
query itself. Its form-state logic (anonymous / not-verified /
already-reviewed / can-review) still runs inside the component using
`data.productId`. The `ProductJsonLd` component gains an optional `reviews`
prop threaded through to `buildProductJsonLd`.

## Helpful-votes — storefront + API

### `components/reviews/HelpfulButton.tsx` (client)

- Self-hydrates: on mount it resolves a visitor id (existing
  `rosette.visitor.v1` or a freshly generated `crypto.randomUUID()`), then
  `GET /api/reviews/{id}/vote?visitor={visitorId}` and stores `{ helpful,
  voted }`.
- Renders a button labelled `Helpful · {helpful}`; filled/primary style when
  `voted`. Clicking toggles via `POST /api/reviews/{id}/vote` with
  `{ visitor }` in the body, and updates the count optimistically (reverting
  on error).
- The visitor id is always sent; the server prefers the signed-in customer
  when a session cookie is present, so signed-in votes stay deduped by
  customer regardless of the visitor id.

`ProductReviews` renders `<HelpfulButton reviewId={review.id} />` on each
approved review in the list.

### Route `app/api/reviews/[id]/vote/route.ts`

- Public. Resolves the voter key: `getCurrentCustomer()` first (→
  `customer:<id>`); if not signed in, the `visitor` query/body value (→
  `visitor:<uuid>`); if neither → 400.
- `GET` → `getVoteState`; `POST` → `toggleVote`. Unknown review → 404. Both
  return `{ helpful, voted }` (or 404 for a missing review).

## Review photos — upload + submit

### Route `app/api/account/review-photos/route.ts`

- Auth-gated via `getCurrentCustomer()` → 401 when absent.
- `multipart/form-data`: reads `request.formData()`, collects
  `getAll('photos')` as `File`s, converts to `ReviewPhotoInput[]` (reading
  `arrayBuffer()`), validates with `validateReviewPhotos` → 400 with the
  reason on failure.
- Uploads via `uploadReviewPhotos` (service-role admin client's storage) and
  returns `{ urls: string[] }`.

### Review submit extension

`submitProductReview` (in `features/reviews/reviews-service.ts`) accepts an
optional `photoUrls: string[]`. Validation: ≤3 URLs and every URL passes
`isReviewImageUrl` (→ `invalid` otherwise). The insert includes
`photos: photoUrls`. `ReviewForm` is the only caller, so the existing route
body gains an optional `photos` array, validated before insertion.

### `ReviewForm` changes

- A "Add photos (optional)" control: a file input (accept jpeg/png/webp,
  `multiple`), showing thumbnails of the selected files (via `URL.createObjectURL`).
- On submit: first uploads the selected photos via
  `POST /api/account/review-photos` (FormData, field `photos`), then submits
  the review with `{ rating, body, photos: urls }`.
- Upload failure (e.g. 413/400) shows `photoUploadFailed` and aborts the review
  submit. The existing pending-success flow is unchanged.

## Admin

`/admin/reviews` (pending + approved tabs) shows review photo thumbnails when
`photos` is non-empty: the admin list query selects `photos`, and each row
renders up to 3 small `<img>` tags (public URLs).

Reject cleanup: `reviewProductReview`'s reject branch reads the row's `photos`
before deleting, then best-effort removes each object from the `review-images`
bucket (wrapped in try/catch so a storage failure never blocks the rejection).

## i18n keys (EN / AR / FR)

`helpful` ('Helpful'), `helpfulCount` ('{count} people found this helpful'),
`addPhotos` ('Add photos (optional)'), `removePhoto` ('Remove photo'),
`photoUploadFailed` ('Couldn't upload photos — try again.'),
`photoTooLarge` ('Each photo must be under 5 MB.'),
`photoInvalidType` ('Photos must be JPEG, PNG, or WebP.'),
`photoTooMany` ('You can attach up to 3 photos.').

## Out of scope

- Demo/local catalog reviews remain text-only; the photo picker is gated on
  the same verified-purchase state as the review form (and the reviews section
  itself already renders only when Supabase is configured).
- Video, drag-and-drop, photo moderation independent of the review (a rejected
  review's photos are deleted with it).
- Helpful-vote sorting/filtering ("most helpful first"), vote counts on admin.
- Orphan cleanup for photos uploaded but never submitted (the review is never
  created, so the objects stay until a future sweep).
- Review JSON-LD on list/card pages (aggregate ratings already show on cards;
  the schema.org markup lives on the product page only).

## Tests

- `tests/domain/product-jsonld.test.ts` (extend) — emits `aggregateRating`
  when `rating.count > 0` (absent when 0), and up-to-10 `review` nodes with
  author/rating/body/date when reviews are passed.
- `tests/domain/vote-service.test.ts` (new) — `customerVoterKey`/`visitorVoterKey`
  format, `getVoteState` count + voted, `toggleVote` insert-on-first /
  delete-on-second (dedupe via the fake's unique behavior), re-count after
  toggle.
- `tests/domain/review-storage.test.ts` (new) — `validateReviewPhotos` (too
  many / too large / bad type / ok), `uploadReviewPhotos` path + public URL,
  `isReviewImageUrl` (accepts bucket URLs, rejects foreign URLs).
- `tests/domain/reviews-service.test.ts` (extend) — submit with valid
  `photoUrls` stores `photos`; submit with a foreign URL or >3 URLs → invalid.
- `tests/components/HelpfulButton.test.tsx` (new) — renders count, toggles on
  click with optimistic update, reverts on failure.
- `tests/components/ReviewForm.test.tsx` (extend) — photo picker uploads via
  the photos route then includes URLs in the review submit; upload failure
  shows the error and does not submit.
- Full gate: `npm test`, `npm run lint` (`tsc --noEmit`), `npm run build`.

## Phases

1. Migration `014` + pure `vote-service.ts` + `review-storage.ts` (TDD).
2. JSON-LD: extend `buildProductJsonLd` + shared `getApprovedReviews` +
   page/`ProductReviews` refactor (TDD).
3. Helpful-votes: vote route + `HelpfulButton` + `ProductReviews` wiring (TDD).
4. Photos: upload route + submit extension + `ReviewForm` picker (TDD).
5. Admin: photo thumbnails + reject cleanup + i18n keys.
6. Full gate + review + branch finish.
