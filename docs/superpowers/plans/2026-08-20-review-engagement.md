# Review Engagement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add review JSON-LD rich snippets, a per-review "Helpful" vote, and verified-buyer photo attachments to the existing product-reviews feature.

**Architecture:** A `review_votes` table deduped by a computed `voter_key`; a public Supabase Storage bucket (`review-images`) written only through an auth-gated server route; schema.org `aggregateRating`/`review` nodes on the existing product JSON-LD. The product page fetches approved reviews once and shares them with both `ProductJsonLd` and `ProductReviews`.

**Tech Stack:** Next.js App Router (route handlers, server components), Supabase (`@supabase/supabase-js` + Storage), TypeScript strict, Vitest + jsdom + @testing-library/react (`fireEvent`/`waitFor`, not `userEvent`), Tailwind/shadcn UI.

**Spec:** `docs/superpowers/specs/2026-08-20-review-engagement-design.md`

## Global Constraints

- TypeScript is strict; `npm run lint` runs `tsc --noEmit`. Every `await`ed supabase/fake result must be narrowed (`data ?? []`, `row?.photos`, non-null assertions where the plan shows them).
- Test conventions: `renderWithProviders` from `tests/test-utils.tsx`; mock module paths with `vi.mock('@/lib/supabase/browser', ...)` and `vi.mock('next/navigation', ...)`; mock network with `vi.stubGlobal('fetch', ...)` + `vi.unstubAllGlobals()`; use `fireEvent`/`waitFor` (never `userEvent`). `tests/setup.ts` clears `localStorage` between tests.
- Commit style is conventional (`feat:`, `test:`, `fix:`, `docs:`), one feature commit per task.
- Supabase writes go through `getAdminSupabase()` (service role); anon reads via `getServerSupabase()`. `getServerSupabase()` returns `null` when env is unconfigured — always guard.
- i18n: three locales in `features/i18n/dictionaries.ts` (`en`, `ar`, `fr`), flat `Record<string, string>` keys.

---

### Task 1: Migration `014` + vote & storage modules (TDD)

**Files:**
- Create: `supabase/migrations/014_review_engagement.sql`
- Create: `features/reviews/vote-service.ts`
- Create: `features/reviews/review-storage.ts`
- Test: `tests/domain/vote-service.test.ts`
- Test: `tests/domain/review-storage.test.ts`

**Interfaces:**
- Produces: `vote-service.ts` exports `customerVoterKey(customerId: string): string`, `visitorVoterKey(visitorId: string): string`, `getVoteState(client, { reviewId, voterKey }): Promise<VoteState>`, `toggleVote(client, { reviewId, voterKey }): Promise<VoteState>`, `type VoteState = { status: 'ok'; helpful: number; voted: boolean } | { status: 'not_found' }`.
- Produces: `review-storage.ts` exports `REVIEW_PHOTO_MAX = 3`, `REVIEW_PHOTO_MAX_BYTES = 5 * 1024 * 1024`, `REVIEW_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp']`, `type ReviewPhotoInput = { name: string; type: string; size: number; bytes: ArrayBuffer }`, `validateReviewPhotos(files): ReviewPhotoValidation`, `uploadReviewPhotos(storage, files): Promise<{ urls: string[] }>`, `isReviewImageUrl(url: unknown): url is string`, `reviewImagePathFromUrl(url: string): string | null`.

- [ ] **Step 1: Write the failing tests**

`tests/domain/vote-service.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { customerVoterKey, getVoteState, toggleVote, visitorVoterKey } from '@/features/reviews/vote-service';

type Vote = { review_id: string; voter_key: string };

function fakeClient(options: { reviewExists?: boolean; votes?: Vote[] } = {}) {
  const votes: Vote[] = [...(options.votes ?? [])];
  const reviewExists = options.reviewExists ?? true;
  const from = (table: string) => {
    if (table === 'product_reviews') {
      return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: reviewExists ? { id: 'r1' } : null, error: null }) }) }) };
    }
    if (table === 'review_votes') {
      return {
        select: (cols?: unknown, opts?: { count?: string }) => {
          if (opts?.count === 'exact') {
            return { eq: (_c: string, reviewId: string) => Promise.resolve({ count: votes.filter((v) => v.review_id === reviewId).length }) };
          }
          return {
            eq: (_c: string, reviewId: string) => ({
              eq: (_c2: string, voterKey: string) => ({
                maybeSingle: async () => ({ data: votes.find((v) => v.review_id === reviewId && v.voter_key === voterKey) ?? null, error: null }),
              }),
            }),
          };
        },
        delete: () => ({
          eq: (col: string, val: string) => {
            const rest = votes.filter((v) => v[col as keyof Vote] !== val);
            votes.splice(0, votes.length, ...rest);
            return {
              eq: (col2: string, val2: string) => {
                const rest2 = votes.filter((v) => v[col2 as keyof Vote] !== val2);
                votes.splice(0, votes.length, ...rest2);
                return { error: null };
              },
              error: null,
            };
          },
        }),
        insert: (payload: { review_id: string; voter_key: string }) => { votes.push(payload); return { error: null }; },
      };
    }
    throw new Error(`Unexpected table: ${table}`);
  };
  return { client: { from }, votes };
}

describe('voter keys', () => {
  it('formats a customer voter key', () => {
    expect(customerVoterKey('c1')).toBe('customer:c1');
  });
  it('formats a visitor voter key', () => {
    expect(visitorVoterKey('v1')).toBe('visitor:v1');
  });
});

describe('getVoteState', () => {
  it('returns the count and un-voted state', async () => {
    const { client } = fakeClient({ votes: [{ review_id: 'r1', voter_key: 'customer:a' }, { review_id: 'r1', voter_key: 'visitor:b' }] });
    const result = await getVoteState(client, { reviewId: 'r1', voterKey: 'customer:c1' });
    expect(result).toEqual({ status: 'ok', helpful: 2, voted: false });
  });
  it('returns voted true when the voter has a row', async () => {
    const { client } = fakeClient({ votes: [{ review_id: 'r1', voter_key: 'customer:c1' }] });
    const result = await getVoteState(client, { reviewId: 'r1', voterKey: 'customer:c1' });
    expect(result).toEqual({ status: 'ok', helpful: 1, voted: true });
  });
  it('returns not_found when the review is missing', async () => {
    const { client } = fakeClient({ reviewExists: false });
    const result = await getVoteState(client, { reviewId: 'r1', voterKey: 'customer:c1' });
    expect(result).toEqual({ status: 'not_found' });
  });
});

describe('toggleVote', () => {
  it('inserts on the first toggle', async () => {
    const { client, votes } = fakeClient();
    const result = await toggleVote(client, { reviewId: 'r1', voterKey: 'customer:c1' });
    expect(result).toEqual({ status: 'ok', helpful: 1, voted: true });
    expect(votes).toContainEqual({ review_id: 'r1', voter_key: 'customer:c1' });
  });
  it('deletes on the second toggle', async () => {
    const { client, votes } = fakeClient({ votes: [{ review_id: 'r1', voter_key: 'customer:c1' }] });
    const result = await toggleVote(client, { reviewId: 'r1', voterKey: 'customer:c1' });
    expect(result).toEqual({ status: 'ok', helpful: 0, voted: false });
    expect(votes).toHaveLength(0);
  });
  it('returns not_found when the review is missing', async () => {
    const { client } = fakeClient({ reviewExists: false });
    const result = await toggleVote(client, { reviewId: 'r1', voterKey: 'customer:c1' });
    expect(result).toEqual({ status: 'not_found' });
  });
});
```

> The fake derives the count from its in-memory `votes` array (see `__votes`/`votes` below in the service design); the `select().eq().eq()` chain is a stub that returns `null` — the service never relies on it for counting.

`tests/domain/review-storage.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { isReviewImageUrl, reviewImagePathFromUrl, REVIEW_PHOTO_MAX_BYTES, uploadReviewPhotos, validateReviewPhotos, type ReviewPhotoInput } from '@/features/reviews/review-storage';

const photo = (overrides: Partial<ReviewPhotoInput> = {}): ReviewPhotoInput => ({
  name: 'a.jpg', type: 'image/jpeg', size: 1024, bytes: new ArrayBuffer(4), ...overrides,
});

describe('validateReviewPhotos', () => {
  it('accepts up to 3 valid photos', () => {
    const result = validateReviewPhotos([photo(), photo(), photo()]);
    expect(result).toEqual({ ok: true, photos: [photo(), photo(), photo()] });
  });
  it('rejects more than 3 photos', () => {
    expect(validateReviewPhotos([photo(), photo(), photo(), photo()])).toEqual({ ok: false, reason: 'too_many' });
  });
  it('rejects a photo over 5 MB', () => {
    expect(validateReviewPhotos([photo({ size: REVIEW_PHOTO_MAX_BYTES + 1 })])).toEqual({ ok: false, reason: 'too_large' });
  });
  it('rejects an unsupported type', () => {
    expect(validateReviewPhotos([photo({ type: 'image/gif' })])).toEqual({ ok: false, reason: 'invalid_type' });
  });
});

describe('uploadReviewPhotos', () => {
  it('uploads each file to review-images with its content type and returns public URLs', async () => {
    vi.stubGlobal('crypto', { randomUUID: () => 'fixed-uuid' });
    const upload = vi.fn().mockResolvedValue({ error: null });
    const getPublicUrl = vi.fn((path: string) => ({ data: { publicUrl: `https://x.supabase.co/storage/v1/object/public/review-images/${path}` } }));
    const storage = { from: (bucket: string) => ({ upload, getPublicUrl }) };
    const { urls } = await uploadReviewPhotos(storage, [photo({ type: 'image/png' }), photo({ name: 'b.webp', type: 'image/webp' })]);
    expect(upload).toHaveBeenCalledTimes(2);
    const [firstPath] = upload.mock.calls[0] as [string, ArrayBuffer, { contentType: string }];
    expect(firstPath).toMatch(/\.png$/);
    expect(upload.mock.calls[0][2]).toEqual({ contentType: 'image/png' });
    expect(upload.mock.calls[1][0]).toMatch(/\.webp$/);
    expect(urls).toHaveLength(2);
    expect(urls[0]).toContain('/storage/v1/object/public/review-images/');
    vi.unstubAllGlobals();
  });
});

describe('URL helpers', () => {
  it('isReviewImageUrl accepts bucket URLs and rejects others', () => {
    expect(isReviewImageUrl('https://x.supabase.co/storage/v1/object/public/review-images/a.jpg')).toBe(true);
    expect(isReviewImageUrl('https://evil.com/a.jpg')).toBe(false);
    expect(isReviewImageUrl(42)).toBe(false);
  });
  it('reviewImagePathFromUrl extracts the object path', () => {
    expect(reviewImagePathFromUrl('https://x.supabase.co/storage/v1/object/public/review-images/uuid.jpg')).toBe('uuid.jpg');
    expect(reviewImagePathFromUrl('https://evil.com/a.jpg')).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd /workspaces/Rosette/.worktrees/review-engagement && npx vitest run tests/domain/vote-service.test.ts tests/domain/review-storage.test.ts`
Expected: FAIL — "Cannot find module '@/features/reviews/vote-service'" / "'@/features/reviews/review-storage'".

- [ ] **Step 3: Write the migration**

`supabase/migrations/014_review_engagement.sql`:

```sql
alter table public.product_reviews
  add column photos jsonb not null default '[]'::jsonb;

create table if not exists public.review_votes (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.product_reviews(id) on delete cascade,
  voter_key text not null,
  created_at timestamptz not null default now(),
  unique (review_id, voter_key)
);

create index if not exists review_votes_review_idx on public.review_votes(review_id);

alter table public.review_votes enable row level security;

insert into storage.buckets (id, name, public)
values ('review-images', 'review-images', true)
on conflict (id) do nothing;
```

> If the local migration errors on `storage.buckets` (it should not on hosted/local Supabase), drop that final block and create the `review-images` public bucket via the dashboard; record the deviation in the ledger. The bucket insert is a one-time infra step, not feature logic.

- [ ] **Step 4: Write `features/reviews/vote-service.ts`**

```ts
type VoteClient = { from: (table: string) => any };

export type VoteState =
  | { status: 'ok'; helpful: number; voted: boolean }
  | { status: 'not_found' };

export function customerVoterKey(customerId: string): string {
  return `customer:${customerId}`;
}

export function visitorVoterKey(visitorId: string): string {
  return `visitor:${visitorId}`;
}

async function reviewExists(client: VoteClient, reviewId: string): Promise<boolean> {
  const { data } = await client.from('product_reviews').select('id').eq('id', reviewId).maybeSingle();
  return Boolean(data);
}

async function countVotes(client: VoteClient, reviewId: string): Promise<number> {
  const { count } = await client.from('review_votes').select('id', { count: 'exact', head: true }).eq('review_id', reviewId);
  return typeof count === 'number' ? count : 0;
}

async function hasVoted(client: VoteClient, reviewId: string, voterKey: string): Promise<boolean> {
  const { data } = await client.from('review_votes').select('id').eq('review_id', reviewId).eq('voter_key', voterKey).maybeSingle();
  return Boolean(data);
}

export async function getVoteState(client: VoteClient, input: { reviewId: string; voterKey: string }): Promise<VoteState> {
  if (!(await reviewExists(client, input.reviewId))) return { status: 'not_found' };
  const [helpful, voted] = await Promise.all([countVotes(client, input.reviewId), hasVoted(client, input.reviewId, input.voterKey)]);
  return { status: 'ok', helpful, voted };
}

export async function toggleVote(client: VoteClient, input: { reviewId: string; voterKey: string }): Promise<VoteState> {
  if (!(await reviewExists(client, input.reviewId))) return { status: 'not_found' };
  const voted = await hasVoted(client, input.reviewId, input.voterKey);
  if (voted) {
    await client.from('review_votes').delete().eq('review_id', input.reviewId).eq('voter_key', input.voterKey);
  } else {
    await client.from('review_votes').insert({ review_id: input.reviewId, voter_key: input.voterKey });
  }
  const helpful = await countVotes(client, input.reviewId);
  return { status: 'ok', helpful, voted: !voted };
}
```

- [ ] **Step 5: Write `features/reviews/review-storage.ts`**

```ts
export type ReviewPhotoInput = { name: string; type: string; size: number; bytes: ArrayBuffer };
export type ReviewPhotoValidation = { ok: true; photos: ReviewPhotoInput[] } | { ok: false; reason: 'too_many' | 'too_large' | 'invalid_type' };

export const REVIEW_PHOTO_MAX = 3;
export const REVIEW_PHOTO_MAX_BYTES = 5 * 1024 * 1024;
export const REVIEW_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

const EXT_BY_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export function validateReviewPhotos(files: ReviewPhotoInput[]): ReviewPhotoValidation {
  if (files.length > REVIEW_PHOTO_MAX) return { ok: false, reason: 'too_many' };
  if (files.some((file) => file.size > REVIEW_PHOTO_MAX_BYTES)) return { ok: false, reason: 'too_large' };
  if (files.some((file) => !(REVIEW_PHOTO_TYPES as readonly string[]).includes(file.type))) return { ok: false, reason: 'invalid_type' };
  return { ok: true, photos: files };
}

export function isReviewImageUrl(url: unknown): url is string {
  return typeof url === 'string' && url.includes('/storage/v1/object/public/review-images/');
}

export function reviewImagePathFromUrl(url: string): string | null {
  const marker = '/review-images/';
  const index = url.indexOf(marker);
  if (index === -1) return null;
  return url.slice(index + marker.length);
}

type ReviewStorage = { from: (bucket: string) => { upload: (path: string, bytes: ArrayBuffer, options: { contentType: string }) => Promise<{ error: unknown }>; getPublicUrl: (path: string) => { data: { publicUrl: string } } } };

export async function uploadReviewPhotos(storage: ReviewStorage, files: ReviewPhotoInput[]): Promise<{ urls: string[] }> {
  const bucket = storage.from('review-images');
  const urls: string[] = [];
  for (const file of files) {
    const ext = EXT_BY_TYPE[file.type] ?? 'bin';
    const path = `${crypto.randomUUID()}.${ext}`;
    const { error } = await bucket.upload(path, file.bytes, { contentType: file.type });
    if (error) throw new Error('upload_failed');
    const { data } = bucket.getPublicUrl(path);
    urls.push(data.publicUrl);
  }
  return { urls };
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd /workspaces/Rosette/.worktrees/review-engagement && npx vitest run tests/domain/vote-service.test.ts tests/domain/review-storage.test.ts`
Expected: PASS — 8 vote tests + 7 storage tests.

- [ ] **Step 7: Commit**

```bash
cd /workspaces/Rosette/.worktrees/review-engagement
git add supabase/migrations/014_review_engagement.sql features/reviews/vote-service.ts features/reviews/review-storage.ts tests/domain/vote-service.test.ts tests/domain/review-storage.test.ts
git commit -m "feat: review votes table and photo/storage modules for review engagement"
```

---

### Task 2: JSON-LD + shared review fetch + page refactor (TDD)

**Files:**
- Modify: `features/seo/product-jsonld.ts`
- Create: `features/reviews/get-approved-reviews.ts`
- Modify: `components/seo/ProductJsonLd.tsx`
- Modify: `app/[locale]/[city]/shop/[slug]/page.tsx`
- Modify: `components/reviews/ProductReviews.tsx`
- Test: `tests/domain/product-jsonld.test.ts` (extend)

**Interfaces:**
- Consumes: `product.rating?: { average: number; count: number }` from `features/catalog/types.ts` (already populated by both catalog repos).
- Produces: `getApprovedReviews(productSlug: string): Promise<ApprovedReviewData | null>` where `type ApprovedReview = { id: string; rating: number; body: string; createdAt: string; displayName?: string | null }` and `type ApprovedReviewData = { productId: string | null; reviews: ApprovedReview[]; aggregate: ReviewAggregate }`.
- Produces: `buildProductJsonLd(product: Product, reviews?: JsonLdReview[])` with `type JsonLdReview = { rating: number; body: string; createdAt: string; displayName?: string | null }`.

- [ ] **Step 1: Extend the failing test**

In `tests/domain/product-jsonld.test.ts`, add to the existing `describe` (keep the existing test):

```ts
it('emits aggregateRating when the product has reviews', () => {
  const json = buildProductJsonLd({ ...product, rating: { average: 4.8, count: 12 } });
  expect(json.aggregateRating).toEqual({ '@type': 'AggregateRating', ratingValue: 4.8, reviewCount: 12 });
});

it('omits aggregateRating when there are no reviews', () => {
  const json = buildProductJsonLd(product);
  expect('aggregateRating' in json).toBe(false);
});

it('emits up to 10 review nodes with author, rating, body and date', () => {
  const reviews = Array.from({ length: 11 }, (_, i) => ({ rating: 5, body: `Body ${i}`, createdAt: `2026-08-0${(i % 9) + 1}T00:00:00Z`, displayName: `Person ${i}` }));
  const json = buildProductJsonLd(product, reviews);
  expect(Array.isArray(json.review)).toBe(true);
  expect(json.review).toHaveLength(10);
  expect(json.review[0]).toEqual({
    '@type': 'Review',
    author: { '@type': 'Person', name: 'Person 0' },
    reviewRating: { '@type': 'Rating', ratingValue: 5 },
    reviewBody: 'Body 0',
    datePublished: '2026-08-01T00:00:00Z',
  });
});

it('omits the review array when no reviews are passed', () => {
  const json = buildProductJsonLd(product);
  expect('review' in json).toBe(false);
});

it('omits the author name when a review has no display name', () => {
  const json = buildProductJsonLd(product, [{ rating: 4, body: 'ok', createdAt: '2026-08-01T00:00:00Z', displayName: null }]);
  expect(json.review[0].author).toEqual({ '@type': 'Person' });
});
```

- [ ] **Step 2: Run to verify failures**

Run: `cd /workspaces/Rosette/.worktrees/review-engagement && npx vitest run tests/domain/product-jsonld.test.ts`
Expected: FAIL — `json.aggregateRating` / `json.review` are `undefined`.

- [ ] **Step 3: Extend `features/seo/product-jsonld.ts`**

```ts
import type { Product } from '@/features/catalog/types';

export type JsonLdReview = { rating: number; body: string; createdAt: string; displayName?: string | null };

export function buildProductJsonLd(product: Product, reviews?: JsonLdReview[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: product.description,
    image: product.imageUrl ? [product.imageUrl] : undefined,
    sku: product.slug,
    offers: {
      '@type': 'Offer',
      priceCurrency: 'EGP',
      price: (product.price / 100).toFixed(2),
      availability: 'https://schema.org/InStock',
    },
    ...(product.rating && product.rating.count > 0
      ? { aggregateRating: { '@type': 'AggregateRating', ratingValue: product.rating.average, reviewCount: product.rating.count } }
      : {}),
    ...(reviews && reviews.length > 0
      ? {
          review: reviews.slice(0, 10).map((review) => ({
            '@type': 'Review',
            author: { '@type': 'Person', ...(review.displayName ? { name: review.displayName } : {}) },
            reviewRating: { '@type': 'Rating', ratingValue: review.rating },
            reviewBody: review.body,
            datePublished: review.createdAt,
          })),
        }
      : {}),
  };
}
```

- [ ] **Step 4: Run to verify the JSON-LD tests pass**

Run: `cd /workspaces/Rosette/.worktrees/review-engagement && npx vitest run tests/domain/product-jsonld.test.ts`
Expected: PASS — 6 tests (1 existing + 5 new).

- [ ] **Step 5: Write `features/reviews/get-approved-reviews.ts`**

```ts
import { getServerSupabase } from '@/lib/supabase/server';
import { ratingBySlug, type ReviewAggregate } from '@/features/reviews/aggregate';

export type ApprovedReview = { id: string; rating: number; body: string; createdAt: string; displayName?: string | null };
export type ApprovedReviewData = { productId: string | null; reviews: ApprovedReview[]; aggregate: ReviewAggregate };

export async function getApprovedReviews(productSlug: string): Promise<ApprovedReviewData | null> {
  const supabase = await getServerSupabase();
  if (!supabase) return null;
  const { data: product } = await supabase.from('products').select('id').eq('slug', productSlug).maybeSingle();
  if (!product) return null;
  const { data: reviewRows } = await supabase.from('product_reviews')
    .select('id,rating,body,created_at,profiles(display_name)')
    .eq('product_id', product.id)
    .eq('status', 'approved')
    .order('created_at', { ascending: false });
  const reviews = ((reviewRows ?? []) as Array<{ id: string; rating: number; body: string; created_at: string; profiles?: { display_name?: string | null } | null }>)
    .map((row): ApprovedReview => ({ id: String(row.id), rating: Number(row.rating), body: String(row.body), createdAt: String(row.created_at), displayName: row.profiles?.display_name ?? null }));
  const aggregate = ratingBySlug(reviews.map((review) => ({ product_slug: productSlug, rating: review.rating, status: 'approved' }))).get(productSlug) ?? { average: 0, count: 0 };
  return { productId: String(product.id), reviews, aggregate };
}
```

- [ ] **Step 6: Update `components/seo/ProductJsonLd.tsx`**

```tsx
import type { Product } from '@/features/catalog/types';
import { buildProductJsonLd, type JsonLdReview } from '@/features/seo/product-jsonld';

export function ProductJsonLd({ product, reviews }: { product: Product; reviews?: JsonLdReview[] }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(buildProductJsonLd(product, reviews)) }} />;
}
```

- [ ] **Step 7: Refactor `components/reviews/ProductReviews.tsx`**

Replace the component to accept `data` instead of fetching reviews itself:

```tsx
import { getServerT } from '@/features/i18n/server';
import { getCurrentCustomer } from '@/features/auth/customer';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { StarRating } from '@/components/ui/StarRating';
import { ReviewForm, type ReviewFormState } from './ReviewForm';
import type { ApprovedReviewData } from '@/features/reviews/get-approved-reviews';

export async function ProductReviews({ productSlug, locale, data }: { productSlug: string; locale: string; data: ApprovedReviewData | null }) {
  const { t } = await getServerT();
  if (!data || !data.productId) return null;
  const { reviews, aggregate } = data;
  const breakdown = [5, 4, 3, 2, 1].map((star) => ({ star, count: reviews.filter((row) => row.rating === star).length }));

  let formState: ReviewFormState = 'anonymous';
  const customer = await getCurrentCustomer();
  if (customer) {
    const { data: orders } = await getAdminSupabase().from('orders')
      .select('id,order_items(product_slug,product_id)')
      .eq('customer_id', customer.id)
      .eq('payment_status', 'paid')
      .limit(10);
    const rows = (orders ?? []) as Array<{ id: string; order_items?: Array<{ product_slug?: string | null; product_id?: string | null }> }>;
    const eligibleOrder = rows.find((order) => (order.order_items ?? []).some((item) => item.product_slug === productSlug || item.product_id === data.productId));
    const { data: existing } = eligibleOrder ? await getAdminSupabase().from('product_reviews').select('id').eq('order_id', eligibleOrder.id).eq('product_id', data.productId).maybeSingle() : { data: null };
    formState = !eligibleOrder ? 'not-verified' : existing ? 'already-reviewed' : 'can-review';
  }

  return (
    <section className="mt-16 border-t pt-10">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <h2 className="font-display text-3xl">{t('reviews')}</h2>
        {aggregate && aggregate.count > 0 ? (
          <p className="text-sm text-muted-foreground">{t('reviewAverage', { average: aggregate.average.toFixed(1), count: aggregate.count })}</p>
        ) : null}
      </div>

      {aggregate && aggregate.count > 0 ? (
        <div className="mt-4 grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-8 max-md:grid-cols-1">
          <div className="grid gap-2">
            {breakdown.map(({ star, count }) => (
              <p key={star} className="flex items-center gap-3 text-sm text-muted-foreground">
                <StarRating value={star} size={12} /> {star} · {count}
              </p>
            ))}
          </div>
          <div className="grid content-start gap-4">
            {reviews.map((review) => (
              <article key={review.id} className="border-b pb-4">
                <div className="flex items-center gap-2"><StarRating value={review.rating} />{review.displayName ?? t('verifiedCustomer')}</div>
                <p className="mt-1 text-sm">{review.body}</p>
                <p className="mt-1 text-xs text-muted-foreground">{new Date(review.createdAt).toLocaleDateString(locale === 'ar' ? 'ar-EG' : locale === 'fr' ? 'fr-FR' : 'en-GB')}</p>
              </article>
            ))}
          </div>
        </div>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">{t('noReviews')}</p>
      )}

      <div className="mt-10">
        <h3 className="font-display text-xl">{t('writeReview')}</h3>
        <div className="mt-3 max-w-xl"><ReviewForm productSlug={productSlug} state={formState} /></div>
      </div>
    </section>
  );
}
```

- [ ] **Step 8: Update `app/[locale]/[city]/shop/[slug]/page.tsx`**

Add the import and the shared fetch, then thread `reviews`/`data`:

```tsx
import { getApprovedReviews } from '@/features/reviews/get-approved-reviews';
```

Immediately after the `if (!product) return ...` early return (so `product` is narrowed non-null), add:

```tsx
const reviewData = await getApprovedReviews(product.slug);
```

Change the return JSX:
- `<ProductJsonLd product={product} />` → `<ProductJsonLd product={product} reviews={reviewData?.reviews} />`
- `<ProductReviews productSlug={product.slug} locale={locale} />` → `<ProductReviews productSlug={product.slug} locale={locale} data={reviewData} />`

> `reviewData` is `null` in local demo mode (where `getServerSupabase()` is `null`); `ProductReviews` handles `null` by returning `null`, and `ProductJsonLd` gets no `reviews` (but still emits `aggregateRating` from `product.rating`).

- [ ] **Step 9: Typecheck the refactor**

Run: `cd /workspaces/Rosette/.worktrees/review-engagement && npm run lint 2>&1 | tail -20`
Expected: no `tsc` errors from the refactor.

- [ ] **Step 10: Commit**

```bash
cd /workspaces/Rosette/.worktrees/review-engagement
git add features/seo/product-jsonld.ts features/reviews/get-approved-reviews.ts components/seo/ProductJsonLd.tsx components/reviews/ProductReviews.tsx "app/[locale]/[city]/shop/[slug]/page.tsx" tests/domain/product-jsonld.test.ts
git commit -m "feat: review JSON-LD and shared approved-review fetch on the product page"
```

---

### Task 3: Helpful-votes route + button (TDD)

**Files:**
- Create: `app/api/reviews/[id]/vote/route.ts`
- Create: `components/reviews/HelpfulButton.tsx`
- Modify: `components/reviews/ProductReviews.tsx` (render the button per review)
- Modify: `features/i18n/dictionaries.ts` (2 keys × 3 locales)
- Test: `tests/components/HelpfulButton.test.tsx`

**Interfaces:**
- Consumes: `getVoteState`/`toggleVote`/`customerVoterKey`/`visitorVoterKey` from Task 1; `getCurrentCustomer` from `@/features/auth/customer`; `getAdminSupabase` from `@/lib/supabase/admin`.
- Produces: public `GET`/`POST /api/reviews/[id]/vote` returning `{ helpful, voted }` (or 400/404); `HelpfulButton` client component.

- [ ] **Step 1: Add the i18n keys**

In `features/i18n/dictionaries.ts`, replace each locale's tail key (three separate str_replace edits):

- EN: `reviewActionFailed: 'Could not review the product review.',` → `reviewActionFailed: 'Could not review the product review.', helpful: 'Helpful', helpfulCount: '{count} people found this helpful',`
- AR: `reviewActionFailed: 'تعذرت مراجعة تقييم المنتج.',` → `reviewActionFailed: 'تعذرت مراجعة تقييم المنتج.', helpful: 'مفيد', helpfulCount: 'وجد {count} أشخاص هذا مفيداً',`
- FR: `reviewActionFailed: 'Impossible de traiter cet avis.',` → `reviewActionFailed: 'Impossible de traiter cet avis.', helpful: 'Utile', helpfulCount: '{count} personnes ont trouvé cela utile',`

- [ ] **Step 2: Write the failing test**

`tests/components/HelpfulButton.test.tsx`:

```tsx
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { HelpfulButton } from '@/components/reviews/HelpfulButton';
import { renderWithProviders } from '../test-utils';

describe('HelpfulButton', () => {
  it('loads and renders the helpful count', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ helpful: 7, voted: false }) });
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('crypto', { randomUUID: () => 'visitor-1' });
    renderWithProviders(<HelpfulButton reviewId="rev-1" />);
    const button = await screen.findByRole('button', { name: /helpful/i });
    await waitFor(() => expect(button).toHaveTextContent('7'));
    expect(fetchMock).toHaveBeenCalledWith('/api/reviews/rev-1/vote?visitor=visitor-1');
    vi.unstubAllGlobals();
  });

  it('toggles optimistically and posts the visitor id', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ helpful: 3, voted: false }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ helpful: 4, voted: true }) });
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('crypto', { randomUUID: () => 'visitor-1' });
    renderWithProviders(<HelpfulButton reviewId="rev-1" />);
    const button = await screen.findByRole('button', { name: /helpful/i });
    fireEvent.click(button);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/reviews/rev-1/vote', expect.objectContaining({ method: 'POST' })));
    const [, init] = fetchMock.mock.calls[1] as [string, { body: string }];
    expect(JSON.parse(init.body)).toEqual({ visitor: 'visitor-1' });
    await waitFor(() => expect(button).toHaveTextContent('4'));
    vi.unstubAllGlobals();
  });

  it('reverts the optimistic toggle when the request fails', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ helpful: 2, voted: false }) })
      .mockResolvedValueOnce({ ok: false, json: async () => ({}) });
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('crypto', { randomUUID: () => 'visitor-1' });
    renderWithProviders(<HelpfulButton reviewId="rev-1" />);
    const button = await screen.findByRole('button', { name: /helpful/i });
    fireEvent.click(button);
    await waitFor(() => expect(button).toHaveTextContent('2'));
    vi.unstubAllGlobals();
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `cd /workspaces/Rosette/.worktrees/review-engagement && npx vitest run tests/components/HelpfulButton.test.tsx`
Expected: FAIL — "Cannot find module '@/components/reviews/HelpfulButton'".

- [ ] **Step 4: Write `app/api/reviews/[id]/vote/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { customerVoterKey, getVoteState, toggleVote, visitorVoterKey } from '@/features/reviews/vote-service';
import { getCurrentCustomer } from '@/features/auth/customer';
import { getAdminSupabase } from '@/lib/supabase/admin';

type VoteContext = { params: Promise<{ id: string }> };

async function resolveVoterKey(request: Request): Promise<string | null> {
  const customer = await getCurrentCustomer();
  if (customer) return customerVoterKey(customer.id);
  const url = new URL(request.url);
  const visitor = url.searchParams.get('visitor');
  return visitor ? visitorVoterKey(visitor) : null;
}

export async function GET(request: Request, context: VoteContext) {
  const { id } = await context.params;
  const voterKey = await resolveVoterKey(request);
  if (!voterKey) return NextResponse.json({ error: 'A visitor id is required' }, { status: 400 });
  const result = await getVoteState(getAdminSupabase(), { reviewId: id, voterKey });
  if (result.status === 'not_found') return NextResponse.json({ error: 'Review not found' }, { status: 404 });
  return NextResponse.json({ helpful: result.helpful, voted: result.voted });
}

export async function POST(request: Request, context: VoteContext) {
  const { id } = await context.params;
  const body = (await request.json().catch(() => ({}))) as { visitor?: unknown };
  const customer = await getCurrentCustomer();
  const voterKey = customer ? customerVoterKey(customer.id) : (typeof body.visitor === 'string' && body.visitor ? visitorVoterKey(body.visitor) : null);
  if (!voterKey) return NextResponse.json({ error: 'A visitor id is required' }, { status: 400 });
  const result = await toggleVote(getAdminSupabase(), { reviewId: id, voterKey });
  if (result.status === 'not_found') return NextResponse.json({ error: 'Review not found' }, { status: 404 });
  return NextResponse.json({ helpful: result.helpful, voted: result.voted });
}
```

- [ ] **Step 5: Write `components/reviews/HelpfulButton.tsx`**

```tsx
'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ThumbsUp } from 'lucide-react';
import { useI18n } from '@/features/i18n/I18nProvider';

const VISITOR_KEY = 'rosette.visitor.v1';

function getVisitorId(): string {
  let id = localStorage.getItem(VISITOR_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(VISITOR_KEY, id);
  }
  return id;
}

export function HelpfulButton({ reviewId }: { reviewId: string }) {
  const { t } = useI18n();
  const [helpful, setHelpful] = useState(0);
  const [voted, setVoted] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const visitor = getVisitorId();
      const response = await fetch(`/api/reviews/${reviewId}/vote?visitor=${encodeURIComponent(visitor)}`);
      if (cancelled) return;
      if (response.ok) {
        const data = await response.json();
        setHelpful(data.helpful);
        setVoted(data.voted);
      }
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [reviewId]);

  async function toggle() {
    const visitor = getVisitorId();
    const next = !voted;
    setVoted(next);
    setHelpful((count) => count + (next ? 1 : -1));
    const response = await fetch(`/api/reviews/${reviewId}/vote`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ visitor }) });
    if (!response.ok) {
      setVoted(!next);
      setHelpful((count) => count + (next ? -1 : 1));
      return;
    }
    const data = await response.json();
    setHelpful(data.helpful);
    setVoted(data.voted);
  }

  return (
    <Button type="button" variant="ghost" size="sm" onClick={toggle} disabled={loading} aria-label={t('helpfulCount', { count: helpful })} className={voted ? 'text-primary' : ''}>
      <ThumbsUp size={14} className={voted ? 'fill-current' : ''} aria-hidden="true" />
      {t('helpful')} · {helpful}
    </Button>
  );
}
```

> `variant="ghost"` and `size="sm"` are both defined in `components/ui/button.tsx`. The `aria-label` carries the accessible name, so `getByRole('button', { name: /helpful/i })` still matches via the visible text.

- [ ] **Step 6: Render the button in `components/reviews/ProductReviews.tsx`**

Add the import and one line inside the review `<article>` (after the date `<p>`):

```tsx
import { HelpfulButton } from './HelpfulButton';
```

```tsx
<p className="mt-1 text-xs text-muted-foreground">{new Date(review.createdAt).toLocaleDateString(...)}</p>
<HelpfulButton reviewId={review.id} />
```

- [ ] **Step 7: Run tests + lint**

Run: `cd /workspaces/Rosette/.worktrees/review-engagement && npx vitest run tests/components/HelpfulButton.test.tsx && npm run lint 2>&1 | tail -20`
Expected: PASS (3 tests), lint clean.

- [ ] **Step 8: Commit**

```bash
cd /workspaces/Rosette/.worktrees/review-engagement
git add app/api/reviews/[id]/vote/route.ts components/reviews/HelpfulButton.tsx components/reviews/ProductReviews.tsx features/i18n/dictionaries.ts tests/components/HelpfulButton.test.tsx
git commit -m "feat: per-review helpful vote with a self-hydrating button"
```

---

### Task 4: Photo upload + review submit + form picker (TDD)

**Files:**
- Create: `app/api/account/review-photos/route.ts`
- Modify: `features/reviews/reviews-service.ts` (photoUrls in submit)
- Modify: `app/api/account/products/[slug]/reviews/route.ts`
- Modify: `components/reviews/ReviewForm.tsx`
- Modify: `features/i18n/dictionaries.ts` (6 keys × 3 locales)
- Test: `tests/domain/reviews-service.test.ts` (extend)
- Test: `tests/components/ReviewForm.test.tsx` (extend)

**Interfaces:**
- Consumes: `validateReviewPhotos`/`uploadReviewPhotos`/`isReviewImageUrl`/`REVIEW_PHOTO_MAX`/`REVIEW_PHOTO_MAX_BYTES`/`REVIEW_PHOTO_TYPES` from Task 1.
- Produces: `POST /api/account/review-photos` (multipart) → `{ urls: string[] }`; `submitProductReview` accepts `photoUrls?: string[]` and stores `photos`.

- [ ] **Step 1: Add the i18n keys**

Three str_replace edits in `features/i18n/dictionaries.ts`, appending after the same tail keys as Task 3 (which now end with `helpfulCount: '...',`):

- EN: `helpfulCount: '{count} people found this helpful',` → `helpfulCount: '{count} people found this helpful', addPhotos: 'Add photos (optional)', removePhoto: 'Remove photo', photoUploadFailed: "Couldn't upload photos — try again.", photoTooLarge: 'Each photo must be under 5 MB.', photoInvalidType: 'Photos must be JPEG, PNG, or WebP.', photoTooMany: 'You can attach up to 3 photos.',`
- AR: `helpfulCount: 'وجد {count} أشخاص هذا مفيداً',` → `helpfulCount: 'وجد {count} أشخاص هذا مفيداً', addPhotos: 'أضف صوراً (اختياري)', removePhoto: 'إزالة الصورة', photoUploadFailed: 'تعذر رفع الصور — حاول مرة أخرى.', photoTooLarge: 'يجب أن يكون حجم كل صورة أقل من 5 ميجابايت.', photoInvalidType: 'يجب أن تكون الصور بصيغة JPEG أو PNG أو WebP.', photoTooMany: 'يمكنك إرفاق حتى 3 صور.',`
- FR: `helpfulCount: '{count} personnes ont trouvé cela utile',` → `helpfulCount: '{count} personnes ont trouvé cela utile', addPhotos: 'Ajouter des photos (facultatif)', removePhoto: 'Supprimer la photo', photoUploadFailed: "Impossible d'importer les photos — réessayez.", photoTooLarge: 'Chaque photo doit faire moins de 5 Mo.', photoInvalidType: 'Les photos doivent être en JPEG, PNG ou WebP.', photoTooMany: "Vous pouvez joindre jusqu'à 3 photos.",`

- [ ] **Step 2: Extend `tests/domain/reviews-service.test.ts`**

Add these tests inside the existing `describe('submitProductReview', ...)` block (the fake already returns `orders`/`product` correctly):

```ts
it('stores photos when valid photoUrls are provided', async () => {
  const { client, calls } = fakeClient({ product, orders: [paidOrder] });
  const result = await submitProductReview(client, { customerId: 'c1', productSlug: 'rose-hour', rating: 5, body: 'ok', photoUrls: ['https://x.supabase.co/storage/v1/object/public/review-images/a.jpg'] });
  expect(result).toEqual({ status: 'created' });
  const insert = calls.find((call) => call.table === 'product_reviews');
  expect(insert?.payload).toEqual(expect.objectContaining({ photos: ['https://x.supabase.co/storage/v1/object/public/review-images/a.jpg'] }));
});

it('returns invalid for a foreign photo URL', async () => {
  const { client } = fakeClient({ product, orders: [paidOrder] });
  const result = await submitProductReview(client, { customerId: 'c1', productSlug: 'rose-hour', rating: 5, body: 'ok', photoUrls: ['https://evil.com/a.jpg'] });
  expect(result).toEqual({ status: 'invalid' });
});

it('returns invalid for more than 3 photos', async () => {
  const url = 'https://x.supabase.co/storage/v1/object/public/review-images/';
  const { client } = fakeClient({ product, orders: [paidOrder] });
  const result = await submitProductReview(client, { customerId: 'c1', productSlug: 'rose-hour', rating: 5, body: 'ok', photoUrls: [`${url}1.jpg`, `${url}2.jpg`, `${url}3.jpg`, `${url}4.jpg`] });
  expect(result).toEqual({ status: 'invalid' });
});
```

- [ ] **Step 3: Run to verify they fail**

Run: `cd /workspaces/Rosette/.worktrees/review-engagement && npx vitest run tests/domain/reviews-service.test.ts`
Expected: FAIL — the new tests pass `photoUrls` (not yet accepted) and the `photos`/`invalid` assertions fail.

- [ ] **Step 4: Extend `submitProductReview` in `features/reviews/reviews-service.ts`**

Add the import at the top:

```ts
import { isReviewImageUrl, REVIEW_PHOTO_MAX } from './review-storage';
```

Add `photoUrls` to the input type and validate/store it:

```ts
export async function submitProductReview(
  client: ReviewClient,
  input: { customerId: string; productSlug: string; rating: unknown; body: unknown; photoUrls?: string[] },
): Promise<SubmitReviewResult> {
  try {
    const rating = clampRating(input.rating);
    const body = cleanReviewBody(input.body);
    if (rating === 0 || body === null) return { status: 'invalid' };

    const rawPhotos = input.photoUrls;
    const photoUrls = Array.isArray(rawPhotos) ? rawPhotos : [];
    if (photoUrls.length > REVIEW_PHOTO_MAX || photoUrls.some((url) => !isReviewImageUrl(url))) return { status: 'invalid' };
    const photos = photoUrls as string[];

    // ... (unchanged product lookup, orders eligibility, duplicate check) ...

    const { error } = await client.from('product_reviews').insert({ product_id: product.id, order_id: eligibleOrder.id, customer_id: input.customerId, rating, body, status: 'pending', photos }).select('id').single();
    if (error) return { status: 'failure' };
    return { status: 'created' };
  } catch {
    return { status: 'failure' };
  }
}
```

- [ ] **Step 5: Update the submit route `app/api/account/products/[slug]/reviews/route.ts`**

```ts
const body = (await request.json()) as { rating?: unknown; body?: unknown; photos?: unknown };
const result = await submitProductReview(getAdminSupabase(), { customerId: customer.id, productSlug: slug, rating: body.rating, body: body.body, photoUrls: Array.isArray(body.photos) ? body.photos : [] });
```

- [ ] **Step 6: Run to verify the service tests pass**

Run: `cd /workspaces/Rosette/.worktrees/review-engagement && npx vitest run tests/domain/reviews-service.test.ts`
Expected: PASS — all existing + 3 new tests.

- [ ] **Step 7: Write `app/api/account/review-photos/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { uploadReviewPhotos, validateReviewPhotos, type ReviewPhotoInput } from '@/features/reviews/review-storage';
import { getCurrentCustomer } from '@/features/auth/customer';
import { getAdminSupabase } from '@/lib/supabase/admin';

export async function POST(request: Request) {
  const customer = await getCurrentCustomer();
  if (!customer) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  const formData = await request.formData().catch(() => null);
  if (!formData) return NextResponse.json({ error: 'Expected multipart form data' }, { status: 400 });
  const files = formData.getAll('photos').filter((value): value is File => typeof File !== 'undefined' && value instanceof File);
  const inputs: ReviewPhotoInput[] = await Promise.all(files.map(async (file) => ({ name: file.name, type: file.type, size: file.size, bytes: await file.arrayBuffer() })));
  const validation = validateReviewPhotos(inputs);
  if (!validation.ok) return NextResponse.json({ error: validation.reason }, { status: 400 });
  try {
    const { urls } = await uploadReviewPhotos(getAdminSupabase().storage, validation.photos);
    return NextResponse.json({ urls }, { status: 200 });
  } catch {
    return NextResponse.json({ error: 'Could not upload photos' }, { status: 500 });
  }
}
```

> `getAdminSupabase()` returns the `@supabase/supabase-js` client; `.storage` is its storage namespace, matching the `ReviewStorage` shape in `uploadReviewPhotos`.

- [ ] **Step 8: Extend `tests/components/ReviewForm.test.tsx`**

Add these two tests (keep the existing three):

```tsx
it('uploads photos via the photos route then includes their URLs in the review submit', async () => {
  const fetchMock = vi.fn()
    .mockResolvedValueOnce({ ok: true, json: async () => ({ urls: ['https://x.supabase.co/storage/v1/object/public/review-images/p1.jpg'] }) })
    .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) });
  vi.stubGlobal('fetch', fetchMock);
  renderWithProviders(<ReviewForm productSlug="rose-hour" state="can-review" />);
  fireEvent.click(screen.getByRole('button', { name: /4 out of 5/i }));
  fireEvent.change(screen.getByPlaceholderText(/how was it/i), { target: { value: 'Gorgeous' } });
  const file = new File(['abc'], 'photo.jpg', { type: 'image/jpeg' });
  fireEvent.change(screen.getByLabelText(/add photos/i), { target: { files: [file] } });
  fireEvent.click(screen.getByRole('button', { name: /submit review/i }));
  await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/account/review-photos', expect.objectContaining({ method: 'POST' })));
  await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/account/products/rose-hour/reviews', expect.objectContaining({ method: 'POST' })));
  const [, reviewInit] = fetchMock.mock.calls[1] as [string, { body: string }];
  expect(JSON.parse(reviewInit.body)).toEqual({ rating: 4, body: 'Gorgeous', photos: ['https://x.supabase.co/storage/v1/object/public/review-images/p1.jpg'] });
  vi.unstubAllGlobals();
});

it('shows the photo error and does not submit when the upload fails', async () => {
  const fetchMock = vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: 'too_large' }) });
  vi.stubGlobal('fetch', fetchMock);
  renderWithProviders(<ReviewForm productSlug="rose-hour" state="can-review" />);
  fireEvent.click(screen.getByRole('button', { name: /4 out of 5/i }));
  fireEvent.change(screen.getByPlaceholderText(/how was it/i), { target: { value: 'Gorgeous' } });
  fireEvent.change(screen.getByLabelText(/add photos/i), { target: { files: [new File(['abc'], 'photo.jpg', { type: 'image/jpeg' })] } });
  fireEvent.click(screen.getByRole('button', { name: /submit review/i }));
  expect(await screen.findByText(/couldn't upload photos/i)).toBeInTheDocument();
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(fetchMock).not.toHaveBeenCalledWith('/api/account/products/rose-hour/reviews', expect.anything());
  vi.unstubAllGlobals();
});
```

- [ ] **Step 9: Run to verify they fail**

Run: `cd /workspaces/Rosette/.worktrees/review-engagement && npx vitest run tests/components/ReviewForm.test.tsx`
Expected: FAIL — no "add photos" control yet; the first new test can't find `getByLabelText(/add photos/i)`.

- [ ] **Step 10: Update `components/reviews/ReviewForm.tsx`**

Replace the file with (imports + photo state + picker + submit wiring, preserving the existing early-return branches):

```tsx
'use client';

import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Star, X } from 'lucide-react';
import { useI18n } from '@/features/i18n/I18nProvider';
import { REVIEW_PHOTO_MAX, REVIEW_PHOTO_MAX_BYTES, REVIEW_PHOTO_TYPES } from '@/features/reviews/review-storage';

export type ReviewFormState = 'anonymous' | 'not-verified' | 'already-reviewed' | 'can-review';

const ACCEPT = (REVIEW_PHOTO_TYPES as readonly string[]).join(',');

function makePreview(file: File): string {
  return typeof URL.createObjectURL === 'function' ? URL.createObjectURL(file) : '';
}

export function ReviewForm({ productSlug, state }: { productSlug: string; state: ReviewFormState }) {
  const { t } = useI18n();
  const [rating, setRating] = useState(0);
  const [body, setBody] = useState('');
  const [photos, setPhotos] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  if (state === 'anonymous') {
    return <p className="text-sm text-muted-foreground">{t('reviewSignInPrompt')}</p>;
  }
  if (state === 'not-verified') {
    return <p className="text-sm text-muted-foreground">{t('verifiedPurchaseOnly')}</p>;
  }
  if (state === 'already-reviewed') {
    return <p className="text-sm text-muted-foreground">{t('alreadyReviewed')}</p>;
  }
  if (pending) {
    return <p className="text-sm text-primary" role="status">{t('reviewPending')}</p>;
  }

  function onFiles(files: FileList | null) {
    const next = files ? Array.from(files).slice(0, REVIEW_PHOTO_MAX) : [];
    if (files && files.length > REVIEW_PHOTO_MAX) { setPhotoError(t('photoTooMany')); return; }
    if (next.some((file) => file.size > REVIEW_PHOTO_MAX_BYTES)) { setPhotoError(t('photoTooLarge')); return; }
    if (next.some((file) => !(REVIEW_PHOTO_TYPES as readonly string[]).includes(file.type))) { setPhotoError(t('photoInvalidType')); return; }
    setPhotoError(null);
    setPhotos(next);
  }

  function removePhoto(index: number) {
    setPhotos((current) => current.filter((_, i) => i !== index));
  }

  async function submit() {
    if (rating < 1 || !body.trim() || busy) return;
    setBusy(true);
    setError(false);
    setPhotoError(null);
    let photoUrls: string[] = [];
    if (photos.length > 0) {
      const formData = new FormData();
      photos.forEach((file) => formData.append('photos', file));
      const uploadResponse = await fetch('/api/account/review-photos', { method: 'POST', body: formData });
      if (!uploadResponse.ok) { setBusy(false); setPhotoError(t('photoUploadFailed')); return; }
      const uploadData = await uploadResponse.json();
      photoUrls = Array.isArray(uploadData.urls) ? uploadData.urls : [];
    }
    const response = await fetch(`/api/account/products/${productSlug}/reviews`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rating, body: body.trim(), photos: photoUrls }) });
    setBusy(false);
    if (!response.ok) { setError(true); return; }
    setPending(true);
  }

  return (
    <div className="grid gap-3">
      <div className="flex items-center gap-1" role="group" aria-label={t('rating')}>
        {[1, 2, 3, 4, 5].map((index) => (
          <button key={index} type="button" aria-label={`${index} out of 5`} onClick={() => setRating(index)} className="p-0.5">
            <Star size={20} className={index <= rating ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/40'} />
          </button>
        ))}
      </div>
      <Textarea value={body} onChange={(event) => setBody(event.target.value)} rows={3} maxLength={400} placeholder={t('reviewPlaceholder')} />
      <input ref={fileInput} type="file" accept={ACCEPT} multiple className="hidden" aria-label={t('addPhotos')} onChange={(event) => onFiles(event.target.files)} />
      <button type="button" onClick={() => fileInput.current?.click()} className="text-sm text-primary underline underline-offset-4">{t('addPhotos')}</button>
      {photos.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {photos.map((file, index) => (
            <div key={`${file.name}-${index}`} className="relative">
              <img src={makePreview(file)} alt={file.name} className="h-16 w-16 rounded object-cover" />
              <button type="button" onClick={() => removePhoto(index)} aria-label={t('removePhoto')} className="absolute -right-1 -top-1 rounded-full bg-muted p-0.5"><X size={12} aria-hidden="true" /></button>
            </div>
          ))}
        </div>
      ) : null}
      {photoError ? <p className="text-sm text-destructive">{photoError}</p> : null}
      <div>
        <Button type="button" onClick={submit} disabled={busy || rating < 1 || !body.trim()}>{t('submitReview')}</Button>
      </div>
      {error ? <p className="text-sm text-destructive">{t('reviewSubmitFailed')}</p> : null}
    </div>
  );
}
```

> `makePreview` guards `URL.createObjectURL` because jsdom (the test env) does not implement it; the guard returns `''` in tests and real blob URLs in browsers.

- [ ] **Step 11: Run tests + lint**

Run: `cd /workspaces/Rosette/.worktrees/review-engagement && npx vitest run tests/domain/reviews-service.test.ts tests/components/ReviewForm.test.tsx && npm run lint 2>&1 | tail -20`
Expected: PASS (all service + form tests), lint clean.

- [ ] **Step 12: Commit**

```bash
cd /workspaces/Rosette/.worktrees/review-engagement
git add app/api/account/review-photos/route.ts app/api/account/products/[slug]/reviews/route.ts features/reviews/reviews-service.ts components/reviews/ReviewForm.tsx features/i18n/dictionaries.ts tests/domain/reviews-service.test.ts tests/components/ReviewForm.test.tsx
git commit -m "feat: verified-buyer photo upload and attachment on review submit"
```

---

### Task 5: Admin photo thumbnails + reject cleanup (TDD)

**Files:**
- Modify: `features/reviews/reviews-service.ts` (`reviewProductReview` reject cleanup)
- Modify: `app/admin/reviews/page.tsx` (photo thumbnails)
- Test: `tests/domain/reviews-service.test.ts` (extend)

**Interfaces:**
- Consumes: `reviewImagePathFromUrl` from Task 1.
- Produces: `reviewProductReview(client, input)` now removes each photo object from `review-images` (best-effort) when rejecting.

- [ ] **Step 1: Extend `tests/domain/reviews-service.test.ts`**

Update the `fakeClient` in that file: add `rejectPhotos?: unknown` to its options type, and change its `product_reviews` handler so a one-column `select('photos').eq('id').maybeSingle()` (needed by reject) and the existing two-column `select('id').eq().eq().maybeSingle()` both work:

```ts
if (table === 'product_reviews') {
  return {
    select: () => ({
      eq: () => ({
        maybeSingle: async () => ({ data: options.rejectPhotos ?? null, error: null }),
        eq: () => ({ maybeSingle: async () => ({ data: options.existingReview ?? null, error: null }) }),
      }),
    }),
    insert: (payload: unknown) => { record(table, 'insert', payload); return { select: () => ({ single: async () => ({ data: { id: 'rev-1' }, error: options.insertError ?? null }) }) }; },
    update: (payload: unknown) => ({ eq: (_col: string, id: string) => { record(table, 'update', payload); return { error: options.updateError ?? null }; } }),
    delete: () => ({ eq: (_col: string, id: string) => { record(table, 'delete'); return { error: options.deleteError ?? null }; } }),
  };
}
```

Add a `storage` fake and pass it to the reject calls; add these tests to the `reviewProductReview` describe:

```ts
const storage = {
  from: (bucket: string) => ({ remove: vi.fn().mockResolvedValue({ error: null }) }),
};

it('reject deletes the review and removes its photos from storage', async () => {
  const remove = vi.fn().mockResolvedValue({ error: null });
  const storageClient = { storage: { from: () => ({ remove }) } };
  const { client, calls } = fakeClient({ rejectPhotos: { photos: ['https://x.supabase.co/storage/v1/object/public/review-images/a.jpg', 'https://x.supabase.co/storage/v1/object/public/review-images/b.jpg'] } });
  const result = await reviewProductReview({ ...client, storage: storageClient.storage }, { admin, reviewId: 'rev-1', action: 'reject' });
  expect(result).toEqual({ status: 'rejected' });
  expect(calls).toContainEqual(expect.objectContaining({ table: 'product_reviews', op: 'delete' }));
  expect(remove).toHaveBeenCalledWith(['a.jpg']);
  expect(remove).toHaveBeenCalledWith(['b.jpg']);
});

it('reject still succeeds when storage removal throws', async () => {
  const remove = vi.fn().mockRejectedValue(new Error('storage down'));
  const storageClient = { storage: { from: () => ({ remove }) } };
  const { client } = fakeClient({ rejectPhotos: { photos: ['https://x.supabase.co/storage/v1/object/public/review-images/a.jpg'] } });
  const result = await reviewProductReview({ ...client, storage: storageClient.storage }, { admin, reviewId: 'rev-1', action: 'reject' });
  expect(result).toEqual({ status: 'rejected' });
});
```

> `reviewProductReview`'s first argument type becomes `{ from: (table: string) => any; storage?: { from: (bucket: string) => any } }` (Step 3). Because `storage` is optional, the two existing approve/reject tests keep passing unchanged — the reject test only exercises the updated fake's `select('photos')` path and deletes with no photos to remove. Only the new reject-cleanup tests pass a `storage` fake.

- [ ] **Step 2: Run to verify failures**

Run: `cd /workspaces/Rosette/.worktrees/review-engagement && npx vitest run tests/domain/reviews-service.test.ts`
Expected: FAIL — the reject cleanup tests fail (no storage handling yet).

- [ ] **Step 3: Update `reviewProductReview` in `features/reviews/reviews-service.ts`**

Change the client type and reject branch. Extend the existing `./review-storage` import (added in Task 4) to also import `reviewImagePathFromUrl`, so that import line reads `import { isReviewImageUrl, reviewImagePathFromUrl, REVIEW_PHOTO_MAX } from './review-storage';`:

```ts
type ReviewAdminClient = { from: (table: string) => any; storage?: { from: (bucket: string) => any } };

export async function reviewProductReview(
  client: ReviewAdminClient,
  input: { admin: AdminIdentity; reviewId: string; action: 'approve' | 'reject' },
): Promise<ReviewActionResult> {
  try {
    if (input.action === 'reject') {
      const { data: row } = await client.from('product_reviews').select('photos').eq('id', input.reviewId).maybeSingle();
      const { error } = await client.from('product_reviews').delete().eq('id', input.reviewId);
      if (error) return { status: 'failure' };
      const photos = (Array.isArray(row?.photos) ? row.photos : []).filter((p): p is string => typeof p === 'string');
      const bucket = client.storage?.from('review-images');
      if (bucket) {
        for (const url of photos) {
          const path = reviewImagePathFromUrl(url);
          if (path) {
            try { await bucket.remove([path]); } catch { /* best-effort */ }
          }
        }
      }
      return { status: 'rejected' };
    }
    const { error } = await client.from('product_reviews').update({ status: 'approved', reviewed_by: input.admin.userId, reviewed_at: new Date().toISOString() }).eq('id', input.reviewId);
    if (error) return { status: 'failure' };
    return { status: 'approved' };
  } catch {
    return { status: 'failure' };
  }
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `cd /workspaces/Rosette/.worktrees/review-engagement && npx vitest run tests/domain/reviews-service.test.ts`
Expected: PASS — all submit + review tests (including the 2 new reject-cleanup tests).

- [ ] **Step 5: Show photo thumbnails in `app/admin/reviews/page.tsx`**

Extend the `ReviewRow` type, the select string, and the `mapRow`/cell rendering:

```ts
type ReviewRow = {
  id: string;
  rating: number;
  body: string;
  photos: string[];
  createdAt: string;
  reviewedAt: string | null;
  reviewedByName: string | null;
  product: { id: string; name_en: string } | null;
};
```

- `const select = 'id,rating,body,photos,status,created_at,reviewed_at,reviewed_by,customer_id,products(name_en)';`
- In `mapRow`, add `photos: Array.isArray(row.photos) ? row.photos.filter((p: unknown): p is string => typeof p === 'string') : [],`
- In the body `<TableCell>` (both tabs), render thumbnails under the body text:

```tsx
{review.photos.length > 0 ? (
  <span className="mt-1 flex flex-wrap gap-1">
    {review.photos.slice(0, 3).map((url) => <img key={url} src={url} alt="" className="h-10 w-10 rounded object-cover" />)}
  </span>
) : null}
```

- [ ] **Step 6: Lint + commit**

Run: `cd /workspaces/Rosette/.worktrees/review-engagement && npm run lint 2>&1 | tail -20`
Expected: lint clean.

```bash
cd /workspaces/Rosette/.worktrees/review-engagement
git add features/reviews/reviews-service.ts app/admin/reviews/page.tsx tests/domain/reviews-service.test.ts
git commit -m "feat: admin review photo thumbnails and storage cleanup on reject"
```

---

### Task 6: Full gate + review + branch finish

**Files:** none (verification only).

- [ ] **Step 1: Full test suite**

Run: `cd /workspaces/Rosette/.worktrees/review-engagement && npm test 2>&1 | grep -E "Test Files|Tests|passed|failed"`
Expected: all green (previous suite 527 tests + ~30 new; record the actual totals and mirror them in the ledger if the plan's counts were off).

- [ ] **Step 2: Lint**

Run: `cd /workspaces/Rosette/.worktrees/review-engagement && npm run lint 2>&1 | tail -20`
Expected: clean.

- [ ] **Step 3: Build**

Run: `cd /workspaces/Rosette/.worktrees/review-engagement && npm run build 2>&1 | grep -E "Compiled|error|Error|✓|✗"`
Expected: exit 0; the product page and `/api/reviews/[id]/vote` + `/api/account/review-photos` routes compile.

- [ ] **Step 4: Whole-branch review**

Run: `cd /workspaces/Rosette/.worktrees/review-engagement && git status --short && git log --oneline -6`
Check: only expected files staged; `next-env.d.ts` restored via `git checkout -- next-env.d.ts` if the build touched it.

- [ ] **Step 5: Record rulings in the ledger**

Append to `.superpowers/sdd/2026-08-20-review-engagement/progress.md`: the test totals, any deviations (e.g. the `storage.buckets` insert), and the browser-verification boundary (vote counts + photo upload need live Supabase; JSON-LD is verifiable in local demo mode via the aggregate rating).

- [ ] **Step 6: Hand off for integration**

Report the branch is ready and ask whether to merge into master and push (re-verifying the merged tree first, as with prior features).

---

## Self-Review Notes

- **Spec coverage:** JSON-LD (Task 2), helpful-votes (Task 1 + 3), photos (Task 1 + 4), admin display + reject cleanup (Task 5), i18n keys (Tasks 3–4), tests (each task), full gate (Task 6). All spec sections map to a task.
- **Type consistency:** `VoteState`/`getVoteState`/`toggleVote` signatures match between Task 1 (definition) and Task 3 (route consumption). `uploadReviewPhotos`/`validateReviewPhotos`/`isReviewImageUrl`/`reviewImagePathFromUrl`/`REVIEW_PHOTO_*` match between Task 1 and Tasks 4–5. `ApprovedReviewData`/`JsonLdReview` match between Task 2's `get-approved-reviews.ts` and the page/`ProductReviews`/`ProductJsonLd` consumers. `submitProductReview` gains `photoUrls?` in Task 4 and the route passes it.
- **Known boundary:** vote-count and photo-upload routes require live Supabase (env absent locally), same as the existing wishlist/cart crons; JSON-LD renders in local demo mode from `product.rating`.
