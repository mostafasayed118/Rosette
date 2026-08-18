# Product Reviews & Ratings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let verified customers rate and review products, show approved reviews and aggregates on the storefront, and give admins an approve/reject moderation queue.

**Architecture:** New `product_reviews` table (migration 010) with RLS (approved rows readable by everyone, own rows by the customer); creation and moderation go through the service-role client, mirroring the cancellation feature. Pure logic (`review-rules.ts`, `aggregate.ts`) is tested in isolation; a service layer (`reviews-service.ts`) with injectable Supabase-like clients is tested with fakes; the storefront and admin UI reuse existing patterns (`ProductReviews` server component + `ReviewForm` client component; an admin queue page mirroring `/admin/cancel-requests`).

**Tech Stack:** Next.js App Router (RSC + server actions via API routes), Supabase (Postgres + RLS), shadcn/ui (Card, Badge, Button, Table, Textarea), lucide-react icons, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-18-product-reviews-design.md`

## Global Constraints

- Storefront aggregates count **approved** reviews only.
- Verified purchase = a signed-in customer with an order containing the product whose `payment_status = 'paid'`; one review per `(order_id, product_id)`.
- New reviews are created `status = 'pending'`; `reject` deletes the row (no `rejected` status).
- `rating` 1–5, body 1–400 chars after trim.
- Both catalog repository impls always populate `Product.rating` (absent → `{ average: 0, count: 0 }`); the storefront renders the rating line only when `count > 0`.
- RLS: `select using (status = 'approved')` for everyone, `select using (customer_id = auth.uid())` for own rows; no insert/update policies (service-role only).
- `order_id`/`customer_id` nullable **only** so the seed can ship demo reviews; real reviews always set both.
- i18n dictionaries: every locale stays a superset of the English keys (`tests/domain/i18n-dictionary.test.ts` guards this).
- All money is minor units (piasters); no new env vars.

---

### Task 1: Migration 010 + pure review rules

**Files:**
- Create: `supabase/migrations/010_product_reviews.sql`
- Create: `features/reviews/review-rules.ts`
- Test: `tests/domain/review-rules.test.ts`

**Interfaces:**
- Produces: `isEligibleOrderPayment(paymentStatus: string): boolean`; `canSubmitReview(input: { hasPaidOrderForProduct: boolean; alreadyReviewed: boolean }): 'ok' | 'not_verified' | 'already_reviewed'`; `clampRating(value: unknown): number` (Number(value), NaN/out-of-range → 0); `cleanReviewBody(value: unknown): string | null` (trim; null when empty or >400 chars). Consumed by Task 3.

- [ ] **Step 1: Write the failing test**

Create `tests/domain/review-rules.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { canSubmitReview, clampRating, cleanReviewBody, isEligibleOrderPayment } from '@/features/reviews/review-rules';

describe('isEligibleOrderPayment', () => {
  it('accepts paid and rejects every other status', () => {
    expect(isEligibleOrderPayment('paid')).toBe(true);
    expect(isEligibleOrderPayment('pending')).toBe(false);
    expect(isEligibleOrderPayment('payment_started')).toBe(false);
    expect(isEligibleOrderPayment('payment_failed')).toBe(false);
    expect(isEligibleOrderPayment('refunded')).toBe(false);
    expect(isEligibleOrderPayment('cancelled')).toBe(false);
  });
});

describe('canSubmitReview', () => {
  it('allows a verified customer with no prior review', () => {
    expect(canSubmitReview({ hasPaidOrderForProduct: true, alreadyReviewed: false })).toBe('ok');
  });
  it('blocks customers without a paid order for the product', () => {
    expect(canSubmitReview({ hasPaidOrderForProduct: false, alreadyReviewed: false })).toBe('not_verified');
  });
  it('blocks duplicates even when verified', () => {
    expect(canSubmitReview({ hasPaidOrderForProduct: true, alreadyReviewed: true })).toBe('already_reviewed');
  });
});

describe('clampRating', () => {
  it('parses numeric ratings in range', () => {
    expect(clampRating(5)).toBe(5);
    expect(clampRating('3')).toBe(3);
    expect(clampRating(1)).toBe(1);
  });
  it('returns 0 for invalid or out-of-range values', () => {
    expect(clampRating('abc')).toBe(0);
    expect(clampRating(0)).toBe(0);
    expect(clampRating(6)).toBe(0);
    expect(clampRating(-1)).toBe(0);
    expect(clampRating(null)).toBe(0);
  });
});

describe('cleanReviewBody', () => {
  it('trims surrounding whitespace', () => {
    expect(cleanReviewBody('  lovely  ')).toBe('lovely');
  });
  it('returns null for empty or whitespace-only input', () => {
    expect(cleanReviewBody('   ')).toBeNull();
    expect(cleanReviewBody('')).toBeNull();
    expect(cleanReviewBody(null)).toBeNull();
  });
  it('returns null when the body exceeds 400 chars', () => {
    expect(cleanReviewBody('a'.repeat(401))).toBeNull();
    expect(cleanReviewBody('a'.repeat(400))).toBe('a'.repeat(400));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/domain/review-rules.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create the migration**

Create `supabase/migrations/010_product_reviews.sql`:

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

- [ ] **Step 4: Implement the pure rules**

Create `features/reviews/review-rules.ts`:

```ts
export type ReviewSubmitEligibility = 'ok' | 'not_verified' | 'already_reviewed';

export function isEligibleOrderPayment(paymentStatus: string): boolean {
  return paymentStatus === 'paid';
}

export function canSubmitReview(input: { hasPaidOrderForProduct: boolean; alreadyReviewed: boolean }): ReviewSubmitEligibility {
  if (!input.hasPaidOrderForProduct) return 'not_verified';
  if (input.alreadyReviewed) return 'already_reviewed';
  return 'ok';
}

export function clampRating(value: unknown): number {
  const rating = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return 0;
  return rating;
}

export function cleanReviewBody(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const body = value.trim();
  if (body.length === 0 || body.length > 400) return null;
  return body;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/domain/review-rules.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/010_product_reviews.sql features/reviews/review-rules.ts tests/domain/review-rules.test.ts
git commit -m "feat: product_reviews migration and pure review eligibility rules"
```

---

### Task 2: Catalog rating aggregates (types + both repositories)

**Files:**
- Modify: `features/catalog/types.ts`
- Create: `features/reviews/aggregate.ts`
- Modify: `features/catalog/local-repository.ts`
- Modify: `features/catalog/supabase-repository.ts`
- Test: `tests/domain/aggregate.test.ts`
- Test: `tests/domain/catalog-repository.test.ts` (new file — the local catalog repo has no test file today)

**Interfaces:**
- Consumes: `Product` from `@/features/catalog/types`.
- Produces: `ReviewRatingRow = { product_slug?: string | null; rating: number; status: string }`; `ratingBySlug(rows: ReviewRatingRow[]): Map<string, { average: number; count: number }>` (approved rows only, average rounded to 1 decimal). `Product` gains `rating?: { average: number; count: number }`. Consumed by Task 5 (rating lines) and Task 6.

- [ ] **Step 1: Write the failing test**

Create `tests/domain/aggregate.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { ratingBySlug } from '@/features/reviews/aggregate';

describe('ratingBySlug', () => {
  it('averages approved rows per slug, rounded to one decimal', () => {
    const map = ratingBySlug([
      { product_slug: 'rose-hour', rating: 5, status: 'approved' },
      { product_slug: 'rose-hour', rating: 4, status: 'approved' },
      { product_slug: 'rose-hour', rating: 2, status: 'pending' },
      { product_slug: 'green-morning', rating: 3, status: 'approved' },
    ]);
    expect(map.get('rose-hour')).toEqual({ average: 4.5, count: 2 });
    expect(map.get('green-morning')).toEqual({ average: 3, count: 1 });
  });

  it('ignores pending rows and rows without a slug', () => {
    const map = ratingBySlug([
      { product_slug: 'rose-hour', rating: 5, status: 'pending' },
      { product_slug: null, rating: 4, status: 'approved' },
    ]);
    expect(map.size).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/domain/aggregate.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create the aggregate helper**

Create `features/reviews/aggregate.ts`:

```ts
export type ReviewRatingRow = { product_slug?: string | null; rating: number; status: string };
export type ReviewAggregate = { average: number; count: number };

export function ratingBySlug(rows: ReviewRatingRow[]): Map<string, ReviewAggregate> {
  const sums = new Map<string, { sum: number; count: number }>();
  for (const row of rows) {
    if (row.status !== 'approved' || !row.product_slug) continue;
    const entry = sums.get(row.product_slug) ?? { sum: 0, count: 0 };
    entry.sum += row.rating;
    entry.count += 1;
    sums.set(row.product_slug, entry);
  }
  const result = new Map<string, ReviewAggregate>();
  for (const [slug, { sum, count }] of sums) {
    result.set(slug, { average: Math.round((sum / count) * 10) / 10, count });
  }
  return result;
}

export const NO_REVIEWS: ReviewAggregate = { average: 0, count: 0 };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/domain/aggregate.test.ts`
Expected: PASS.

- [ ] **Step 5: Extend the Product type**

In `features/catalog/types.ts`, add the optional rating field to the `Product` type (append to the existing line):

```ts
export type Product = { slug: string; name: string; nameAr?: string; nameFr?: string; description: string; descriptionAr?: string; descriptionFr?: string; category: string; occasions: string[]; price: number; tone: string; imageUrl: string | null; inventory: number; delivery: string; createdAt: string; variants: ProductVariant[]; addOns: AddOn[]; rating?: { average: number; count: number } };
```

- [ ] **Step 6: Wire the local repository**

Replace the two methods in `features/catalog/local-repository.ts`:

```ts
import { ratingBySlug } from '@/features/reviews/aggregate';
import { demoReviews } from '@/features/reviews/demo-data';
import { getCity } from '@/features/destination/data';
import { filterProducts, sortProducts } from './catalog-utils';
import { products } from './data';
import type { CatalogRepository, CatalogQuery, DeliveryEligibilityInput } from './types';

const ratings = ratingBySlug(demoReviews);

function withRatings(rows: typeof products) {
  return rows.map((product) => ({ ...product, rating: ratings.get(product.slug) ?? { average: 0, count: 0 } }));
}

export const localCatalogRepository: CatalogRepository = {
  async list(query: CatalogQuery) {
    const filtered = sortProducts(filterProducts(products, query), query.sort);
    return { products: withRatings(filtered), total: filtered.length, query };
  },
  async getBySlug(slug) {
    const product = products.find((product) => product.slug === slug);
    return product ? withRatings([product])[0] : null;
  },
  async isDeliverable({ destination, date }: DeliveryEligibilityInput) {
    const city = getCity(destination.cityCode);
    if (!city) return { eligible: false, reason: 'That delivery city is not supported.', fee: 0 };
    const selectedDate = new Date(`${date}T12:00:00`);
    if (Number.isNaN(selectedDate.getTime())) return { eligible: false, reason: 'Choose a valid delivery date.', fee: 0 };
    if (selectedDate.getDay() === 5) return { eligible: false, reason: 'Our studio rests on Fridays. Choose another day.', fee: 0 };
    return { eligible: true, reason: city.sameDay ? 'Same-day delivery may be available before 2pm.' : 'Next-day delivery in this city.', fee: city.sameDay ? 1500 : 2500 };
  },
};
```

Create `features/reviews/demo-data.ts` now so this task is green on its own (Task 4 verifies it, it does not recreate it):

```ts
import type { ReviewRatingRow } from './aggregate';

export const demoReviews: ReviewRatingRow[] = [
  { product_slug: 'rose-hour', rating: 5, status: 'approved' },
  { product_slug: 'rose-hour', rating: 4, status: 'approved' },
  { product_slug: 'green-morning', rating: 5, status: 'approved' },
  { product_slug: 'sunlit-stems', rating: 4, status: 'approved' },
  { product_slug: 'terracotta-love', rating: 5, status: 'approved' },
  { product_slug: 'little-thanks', rating: 5, status: 'approved' },
  { product_slug: 'quiet-orchid', rating: 4, status: 'approved' },
  { product_slug: 'citrus-cloud', rating: 3, status: 'approved' },
  { product_slug: 'wild-meadow', rating: 4, status: 'approved' },
];
```

- [ ] **Step 7: Wire the supabase repository**

Modify `features/catalog/supabase-repository.ts` — add the ratings fetch inside `readProducts` (after the products query) and map them in:

```ts
import { getCity } from '@/features/destination/data';
import { applyDeliveryRule, fetchDeliveryRule } from '@/features/order/delivery-rules';
import { getServerSupabase } from '@/lib/supabase/server';
import { filterProducts, sortProducts } from './catalog-utils';
import { mapSupabaseProduct } from './row-mappers';
import { ratingBySlug, type ReviewRatingRow } from '@/features/reviews/aggregate';
import type { CatalogRepository, CatalogQuery, DeliveryEligibilityInput } from './types';
import type { Product } from './types';

type ProductRow = Parameters<typeof mapSupabaseProduct>[0];

const productSelect = 'slug,name_en,name_ar,name_fr,description_en,description_ar,description_fr,category,occasions,price_minor,tone,image_url,delivery,created_at,add_ons,product_variants(id,name_en,name_ar,name_fr,price_delta_minor,inventory(quantity,reserved_quantity))';

async function readProducts(): Promise<Product[]> {
  const supabase = await getServerSupabase();
  if (!supabase) return [];
  const { data, error } = await supabase.from('products').select(productSelect).eq('active', true);
  if (error) throw new Error(`Catalog query failed: ${error.message}`);
  const products = ((data ?? []) as unknown as ProductRow[]).map(mapSupabaseProduct);
  const { data: reviewRows } = await supabase.from('product_reviews')
    .select('rating,status,products(slug)')
    .eq('status', 'approved');
  const ratings = ratingBySlug(((reviewRows ?? []) as Array<{ rating: number; status: string; products?: { slug?: string } | null }>).map((row): ReviewRatingRow => ({
    product_slug: row.products?.slug ?? null,
    rating: row.rating,
    status: row.status,
  })));
  return products.map((product) => ({ ...product, rating: ratings.get(product.slug) ?? { average: 0, count: 0 } }));
}
```

- [ ] **Step 8: Test the local catalog wiring**

Create `tests/domain/catalog-repository.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { localCatalogRepository } from '@/features/catalog/local-repository';

describe('localCatalogRepository ratings', () => {
  it('attaches an aggregate to every listed product', async () => {
    const page = await localCatalogRepository.list({});
    expect(page.products.length).toBeGreaterThan(0);
    for (const product of page.products) {
      expect(product.rating).toBeDefined();
    }
  });

  it('shows the rose-hour aggregate from demo reviews', async () => {
    const product = await localCatalogRepository.getBySlug('rose-hour');
    expect(product?.rating).toEqual({ average: 4.5, count: 2 });
  });

  it('defaults to zero for products without reviews', async () => {
    const product = await localCatalogRepository.getBySlug('wild-meadow');
    expect(product?.rating).toEqual({ average: 4, count: 1 });
  });
});
```

Run: `npx vitest run tests/domain/catalog-repository.test.ts`
Expected: PASS.

- [ ] **Step 9: Run all tests + typecheck**

Run: `npx vitest run tests/domain/aggregate.test.ts tests/domain/catalog-repository.test.ts tests/domain/catalog-utils.test.ts`
Expected: PASS.
Run: `npm run lint`
Expected: clean, exit 0.

- [ ] **Step 10: Commit**

```bash
git add features/catalog/types.ts features/reviews/aggregate.ts features/reviews/demo-data.ts features/catalog/local-repository.ts features/catalog/supabase-repository.ts tests/domain/aggregate.test.ts tests/domain/catalog-repository.test.ts
git commit -m "feat: catalog rating aggregates from approved reviews (local + supabase)"
```

---

### Task 3: Reviews service + customer submit + admin review routes

**Files:**
- Create: `features/reviews/reviews-service.ts`
- Create: `app/api/account/products/[slug]/reviews/route.ts`
- Create: `app/api/admin/reviews/[id]/route.ts`
- Test: `tests/domain/reviews-service.test.ts`

**Interfaces:**
- Consumes: `isEligibleOrderPayment`, `clampRating`, `cleanReviewBody` from Task 1; `AdminIdentity` from `@/features/admin/authorization`; `getCurrentCustomer` from `@/features/auth/customer`; `getCurrentAdmin` from `@/features/auth/server`; `getAdminSupabase` from `@/lib/supabase/admin`; `respond` from `@/lib/api`.
- Produces: `SubmitReviewResult = { status: 'created' } | { status: 'invalid' } | { status: 'not_found' } | { status: 'not_verified' } | { status: 'already_reviewed' } | { status: 'failure' }`; `submitProductReview(client, input: { customerId: string; productSlug: string; rating: unknown; body: unknown }): Promise<SubmitReviewResult>`; `ReviewActionResult = { status: 'approved' } | { status: 'rejected' } | { status: 'not_found' } | { status: 'failure' }`; `reviewProductReview(client, input: { admin: AdminIdentity; reviewId: string; action: 'approve' | 'reject' }): Promise<ReviewActionResult>`. Consumed by Task 5 (storefront state hint) and Task 6 (admin UI).

- [ ] **Step 1: Write the failing test**

Create `tests/domain/reviews-service.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { submitProductReview, reviewProductReview } from '@/features/reviews/reviews-service';

type Call = { table: string; op: string; payload?: unknown; eq?: Array<[string, unknown]> };

function fakeClient(options: { product?: unknown; orders?: unknown[]; existingReview?: unknown; insertError?: unknown; updateError?: unknown; deleteError?: unknown } = {}) {
  const calls: Call[] = [];
  const record = (table: string, op: string, payload?: unknown) => calls.push({ table, op, payload });
  const from = (table: string) => {
    if (table === 'orders') {
      return {
        select: () => ({ eq: () => ({ order: () => ({ limit: async () => ({ data: options.orders ?? [], error: null }) }) }) }),
      };
    }
    if (table === 'products') {
      return {
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: options.product ?? null, error: null }) }) }),
      };
    }
    if (table === 'product_reviews') {
      return {
        select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: options.existingReview ?? null, error: null }) }) }) }),
        insert: (payload: unknown) => { record(table, 'insert', payload); return { select: () => ({ single: async () => ({ data: { id: 'rev-1' }, error: options.insertError ?? null }) }) }; },
        update: (payload: unknown) => ({ eq: (_col: string, id: string) => { record(table, 'update', payload); return { error: options.updateError ?? null }; } }),
        delete: () => ({ eq: (_col: string, id: string) => { record(table, 'delete'); return { error: options.deleteError ?? null }; } }),
      };
    }
    throw new Error(`Unexpected table: ${table}`);
  };
  return { client: { from }, calls };
}

const admin = { userId: 'a1', role: 'admin' as const };
const product = { id: 'prod-1', slug: 'rose-hour' };
const paidOrder = { id: 'o1', created_at: '2026-08-01T00:00:00Z', payment_status: 'paid', order_items: [{ product_slug: 'rose-hour', product_id: 'prod-1' }] };

describe('submitProductReview', () => {
  it('creates a pending review for a verified purchase', async () => {
    const { client, calls } = fakeClient({ product, orders: [paidOrder] });
    const result = await submitProductReview(client, { customerId: 'c1', productSlug: 'rose-hour', rating: 5, body: '  Gorgeous  ' });
    expect(result).toEqual({ status: 'created' });
    const insert = calls.find((call) => call.table === 'product_reviews');
    expect(insert?.payload).toEqual(expect.objectContaining({ product_id: 'prod-1', order_id: 'o1', customer_id: 'c1', rating: 5, body: 'Gorgeous', status: 'pending' }));
  });

  it('returns not_verified when the customer has no paid order for the product', async () => {
    const { client } = fakeClient({ product, orders: [{ ...paidOrder, payment_status: 'pending' }] });
    const result = await submitProductReview(client, { customerId: 'c1', productSlug: 'rose-hour', rating: 5, body: 'ok' });
    expect(result).toEqual({ status: 'not_verified' });
  });

  it('returns not_verified when no order contains the product at all', async () => {
    const { client } = fakeClient({ product, orders: [{ ...paidOrder, order_items: [{ product_slug: 'other', product_id: 'other-id' }] }] });
    const result = await submitProductReview(client, { customerId: 'c1', productSlug: 'rose-hour', rating: 5, body: 'ok' });
    expect(result).toEqual({ status: 'not_verified' });
  });

  it('matches order items by slug or product id', async () => {
    const { client } = fakeClient({ product, orders: [{ ...paidOrder, order_items: [{ product_slug: 'other', product_id: 'prod-1' }] }] });
    const result = await submitProductReview(client, { customerId: 'c1', productSlug: 'rose-hour', rating: 4, body: 'ok' });
    expect(result).toEqual({ status: 'created' });
  });

  it('returns already_reviewed for a duplicate on the same order and product', async () => {
    const { client } = fakeClient({ product, orders: [paidOrder], existingReview: { id: 'rev-0' } });
    const result = await submitProductReview(client, { customerId: 'c1', productSlug: 'rose-hour', rating: 4, body: 'ok' });
    expect(result).toEqual({ status: 'already_reviewed' });
  });

  it('returns not_found when the product slug is unknown', async () => {
    const { client } = fakeClient({ product: null });
    const result = await submitProductReview(client, { customerId: 'c1', productSlug: 'nope', rating: 4, body: 'ok' });
    expect(result).toEqual({ status: 'not_found' });
  });

  it('returns invalid for out-of-range ratings or empty bodies', async () => {
    const { client } = fakeClient({ product, orders: [paidOrder] });
    expect(await submitProductReview(client, { customerId: 'c1', productSlug: 'rose-hour', rating: 9, body: 'ok' })).toEqual({ status: 'invalid' });
    expect(await submitProductReview(client, { customerId: 'c1', productSlug: 'rose-hour', rating: 4, body: '   ' })).toEqual({ status: 'invalid' });
  });

  it('returns failure when the insert errors', async () => {
    const { client } = fakeClient({ product, orders: [paidOrder], insertError: { message: 'constraint' } });
    const result = await submitProductReview(client, { customerId: 'c1', productSlug: 'rose-hour', rating: 4, body: 'ok' });
    expect(result).toEqual({ status: 'failure' });
  });
});

describe('reviewProductReview', () => {
  it('approves a pending review', async () => {
    const { client, calls } = fakeClient({});
    const result = await reviewProductReview(client, { admin, reviewId: 'rev-1', action: 'approve' });
    expect(result).toEqual({ status: 'approved' });
    const update = calls.find((call) => call.table === 'product_reviews');
    expect(update?.payload).toEqual(expect.objectContaining({ status: 'approved', reviewed_by: 'a1' }));
  });

  it('rejects by deleting the review', async () => {
    const { client, calls } = fakeClient({});
    const result = await reviewProductReview(client, { admin, reviewId: 'rev-1', action: 'reject' });
    expect(result).toEqual({ status: 'rejected' });
    expect(calls).toContainEqual(expect.objectContaining({ table: 'product_reviews', op: 'delete' }));
  });

  it('returns failure when the update errors', async () => {
    const { client } = fakeClient({ updateError: { message: 'nope' } });
    const result = await reviewProductReview(client, { admin, reviewId: 'rev-1', action: 'approve' });
    expect(result).toEqual({ status: 'failure' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/domain/reviews-service.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the service**

Create `features/reviews/reviews-service.ts`:

```ts
import { canSubmitReview, clampRating, cleanReviewBody, isEligibleOrderPayment } from './review-rules';
import type { AdminIdentity } from '@/features/admin/authorization';

type ReviewClient = { from: (table: string) => any };

export type SubmitReviewResult =
  | { status: 'created' }
  | { status: 'invalid' }
  | { status: 'not_found' }
  | { status: 'not_verified' }
  | { status: 'already_reviewed' }
  | { status: 'failure' };

export async function submitProductReview(
  client: ReviewClient,
  input: { customerId: string; productSlug: string; rating: unknown; body: unknown },
): Promise<SubmitReviewResult> {
  try {
    const rating = clampRating(input.rating);
    const body = cleanReviewBody(input.body);
    if (rating === 0 || body === null) return { status: 'invalid' };

    const { data: product } = await client.from('products').select('id').eq('slug', input.productSlug).maybeSingle();
    if (!product) return { status: 'not_found' };

    const { data: orders } = await client.from('orders')
      .select('id,created_at,payment_status,order_items(product_slug,product_id)')
      .eq('customer_id', input.customerId)
      .order('created_at', { ascending: false })
      .limit(10);
    const rows = (orders ?? []) as Array<{ id: string; payment_status: string; order_items?: Array<{ product_slug?: string | null; product_id?: string | null }> }>;
    const eligibleOrder = rows
      .filter((order) => isEligibleOrderPayment(order.payment_status))
      .find((order) => (order.order_items ?? []).some((item) => item.product_slug === input.productSlug || item.product_id === product.id));
    if (!eligibleOrder) return { status: 'not_verified' };

    const { data: existing } = await client.from('product_reviews').select('id').eq('order_id', eligibleOrder.id).eq('product_id', product.id).maybeSingle();
    const eligibility = canSubmitReview({ hasPaidOrderForProduct: true, alreadyReviewed: Boolean(existing) });
    if (eligibility !== 'ok') return { status: eligibility };

    const { error } = await client.from('product_reviews').insert({ product_id: product.id, order_id: eligibleOrder.id, customer_id: input.customerId, rating, body, status: 'pending' }).select('id').single();
    if (error) return { status: 'failure' };
    return { status: 'created' };
  } catch {
    return { status: 'failure' };
  }
}

export type ReviewActionResult =
  | { status: 'approved' }
  | { status: 'rejected' }
  | { status: 'not_found' }
  | { status: 'failure' };

export async function reviewProductReview(
  client: ReviewClient,
  input: { admin: AdminIdentity; reviewId: string; action: 'approve' | 'reject' },
): Promise<ReviewActionResult> {
  try {
    if (input.action === 'reject') {
      const { error } = await client.from('product_reviews').delete().eq('id', input.reviewId);
      if (error) return { status: 'failure' };
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

The eligibility check fetches the customer's recent orders and filters in JS with `isEligibleOrderPayment`, so the helper is exercised in production and the service stays independent of PostgREST filter quirks on embedded `order_items`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/domain/reviews-service.test.ts`
Expected: PASS.

- [ ] **Step 5: Create the customer route**

Create `app/api/account/products/[slug]/reviews/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { submitProductReview } from '@/features/reviews/reviews-service';
import { getCurrentCustomer } from '@/features/auth/customer';
import { getAdminSupabase } from '@/lib/supabase/admin';

export async function POST(request: Request, context: { params: Promise<{ slug: string }> }) {
  const customer = await getCurrentCustomer();
  if (!customer) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  const { slug } = await context.params;
  const body = (await request.json()) as { rating?: unknown; body?: unknown };
  const result = await submitProductReview(getAdminSupabase(), { customerId: customer.id, productSlug: slug, rating: body.rating, body: body.body });
  if (result.status === 'invalid') return NextResponse.json({ error: 'Invalid rating or review body' }, { status: 400 });
  if (result.status === 'not_found') return NextResponse.json({ error: 'Product not found' }, { status: 404 });
  if (result.status === 'not_verified') return NextResponse.json({ error: 'Verified purchase required' }, { status: 403 });
  if (result.status === 'already_reviewed') return NextResponse.json({ error: 'already_reviewed' }, { status: 409 });
  if (result.status === 'failure') return NextResponse.json({ error: 'Could not submit review' }, { status: 500 });
  return NextResponse.json({ ok: true, status: 'pending' }, { status: 201 });
}
```

- [ ] **Step 6: Create the admin route**

Create `app/api/admin/reviews/[id]/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { reviewProductReview } from '@/features/reviews/reviews-service';
import { getCurrentAdmin } from '@/features/auth/server';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { respond } from '@/lib/api';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Admin authorization required' }, { status: 403 });
  const { id } = await context.params;
  const body = (await request.json()) as { action?: unknown };
  if (body.action !== 'approve' && body.action !== 'reject') return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  const result = await reviewProductReview(getAdminSupabase(), { admin, reviewId: id, action: body.action });
  return respond(result.status, {
    not_found: { status: 404, error: 'Review not found' },
    failure: { status: 500, error: 'Could not review the product review' },
  }, { ok: true, status: result.status });
}
```

- [ ] **Step 7: Typecheck + commit**

Run: `npm run lint`
Expected: clean, exit 0.

```bash
git add features/reviews/reviews-service.ts "app/api/account/products/[slug]/reviews/route.ts" "app/api/admin/reviews/[id]/route.ts" tests/domain/reviews-service.test.ts
git commit -m "feat: review submission service and admin approve/reject routes"
```

---

### Task 4: i18n keys + seed reviews + local demo reviews

**Files:**
- Modify: `features/i18n/dictionaries.ts` (EN, AR, FR)
- Modify: `supabase/seed.sql`
- Modify: `features/reviews/demo-data.ts` (already created in Task 2 — verify it exists)

**Interfaces:**
- Produces: the `reviews` i18n keys used by Task 5/6; seeded approved reviews; the `demoReviews` array consumed by Task 2's local repo.

- [ ] **Step 1: Add the i18n keys**

In `features/i18n/dictionaries.ts`, append to the end of each locale line (after the `review:` key added for the cancel-requests queue), keeping EN/AR/FR in sync:

```ts
// EN
reviews: 'Reviews', rating: 'Rating', writeReview: 'Write a review', reviewPlaceholder: 'How was it?', submitReview: 'Submit review', reviewPending: 'Thanks — your review is pending approval.', reviewSignInPrompt: 'Sign in to review', verifiedPurchaseOnly: 'Reviews are reserved for verified purchases.', alreadyReviewed: "You've reviewed this product.", reviewCount: '{count} reviews', reviewAverage: '{average} · {count} reviews', approveReview: 'Approve', rejectReview: 'Reject', noReviews: 'No reviews yet.', noPendingReviews: 'No reviews waiting for approval.', verifiedCustomer: 'Verified customer', reviewSubmitFailed: 'Could not submit your review.', reviewActionFailed: 'Could not review the product review.',
// AR
reviews: 'التقييمات', rating: 'التقييم', writeReview: 'اكتب تقييماً', reviewPlaceholder: 'كيف كانت التجربة؟', submitReview: 'إرسال التقييم', reviewPending: 'شكراً — تقييمك بانتظار الموافقة.', reviewSignInPrompt: 'سجّل الدخول للتقييم', verifiedPurchaseOnly: 'التقييمات متاحة للمشتريات المؤكدة فقط.', alreadyReviewed: 'لقد قيّمت هذا المنتج.', reviewCount: '{count} تقييمات', reviewAverage: '{average} · {count} تقييمات', approveReview: 'موافقة', rejectReview: 'رفض', noReviews: 'لا توجد تقييمات بعد.', noPendingReviews: 'لا توجد تقييمات بانتظار الموافقة.', verifiedCustomer: 'عميل موثّق', reviewSubmitFailed: 'تعذر إرسال تقييمك.', reviewActionFailed: 'تعذرت مراجعة تقييم المنتج.',
// FR
reviews: 'Avis', rating: 'Note', writeReview: 'Écrire un avis', reviewPlaceholder: 'Comment était-ce ?', submitReview: 'Envoyer l’avis', reviewPending: 'Merci — votre avis est en attente de validation.', reviewSignInPrompt: 'Connectez-vous pour donner un avis', verifiedPurchaseOnly: 'Les avis sont réservés aux achats vérifiés.', alreadyReviewed: 'Vous avez déjà donné un avis sur ce produit.', reviewCount: '{count} avis', reviewAverage: '{average} · {count} avis', approveReview: 'Approuver', rejectReview: 'Refuser', noReviews: 'Aucun avis pour le moment.', noPendingReviews: 'Aucun avis en attente de validation.', verifiedCustomer: 'Client vérifié', reviewSubmitFailed: 'Impossible d’envoyer votre avis.', reviewActionFailed: 'Impossible de traiter cet avis.',
```

Run: `npx vitest run tests/domain/i18n-dictionary.test.ts`
Expected: PASS (superset check for AR/FR).

- [ ] **Step 2: Add the seed reviews**

Append to `supabase/seed.sql` (at the end, after the blog_posts block):

```sql
-- ---------------------------------------------------------------------------
-- Product reviews (demo content: order_id/customer_id stay null; approved so
-- the storefront shows aggregates immediately)
-- ---------------------------------------------------------------------------
insert into public.product_reviews (id, product_id, rating, body, status, created_at, reviewed_at)
values
  ('aaaaaaaa-0000-0000-0000-000000000001', (select id from public.products where slug = 'rose-hour'), 5, 'Arrived fresher than expected — the garden roses were beautiful.', 'approved', now() - interval '12 days', now() - interval '11 days'),
  ('aaaaaaaa-0000-0000-0000-000000000002', (select id from public.products where slug = 'rose-hour'), 4, 'Lovely bouquet, generous size. Delivery was right on time.', 'approved', now() - interval '9 days', now() - interval '8 days'),
  ('aaaaaaaa-0000-0000-0000-000000000003', (select id from public.products where slug = 'green-morning'), 5, 'The vase arrangement lasted over a week. Stunning greens.', 'approved', now() - interval '15 days', now() - interval '14 days'),
  ('aaaaaaaa-0000-0000-0000-000000000004', (select id from public.products where slug = 'sunlit-stems'), 4, 'Cheerful and bright — exactly the mood I ordered for.', 'approved', now() - interval '7 days', now() - interval '6 days'),
  ('aaaaaaaa-0000-0000-0000-000000000005', (select id from public.products where slug = 'terracotta-love'), 5, 'The ranunculus were perfection. Wrapping felt so special.', 'approved', now() - interval '20 days', now() - interval '19 days'),
  ('aaaaaaaa-0000-0000-0000-000000000006', (select id from public.products where slug = 'little-thanks'), 5, 'Small but mighty — the perfect thank-you.', 'approved', now() - interval '5 days', now() - interval '4 days'),
  ('aaaaaaaa-0000-0000-0000-000000000007', (select id from public.products where slug = 'quiet-orchid'), 4, 'Elegant plant, well packed. A week later it is still perfect.', 'approved', now() - interval '10 days', now() - interval '9 days'),
  ('aaaaaaaa-0000-0000-0000-000000000008', (select id from public.products where slug = 'citrus-cloud'), 3, 'Pretty, though the fragrance faded faster than I hoped.', 'approved', now() - interval '6 days', now() - interval '5 days')
on conflict (id) do update
  set product_id = excluded.product_id, rating = excluded.rating, body = excluded.body, status = excluded.status, created_at = excluded.created_at, reviewed_at = excluded.reviewed_at;
```

- [ ] **Step 3: Verify demo reviews exist**

Confirm `features/reviews/demo-data.ts` exists with the array from Task 2 (create it if Task 2's commit didn't include it). Run the catalog repository test again:

Run: `npx vitest run tests/domain/catalog-repository.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add features/i18n/dictionaries.ts supabase/seed.sql features/reviews/demo-data.ts
git commit -m "feat: review i18n keys, seed reviews, and local demo reviews"
```

---

### Task 5: Storefront — ProductReviews + ReviewForm + rating lines

**Files:**
- Create: `components/ui/StarRating.tsx`
- Create: `components/reviews/ReviewForm.tsx`
- Create: `components/reviews/ProductReviews.tsx`
- Modify: `app/[locale]/[city]/shop/[slug]/page.tsx`
- Modify: `features/catalog/ProductCard.tsx`
- Modify: `features/product/ProductDetail.tsx`
- Test: `tests/components/ReviewForm.test.tsx`

**Interfaces:**
- Consumes: `submitProductReview` (via the customer route), `ratingBySlug`/`Product.rating` (Task 2), i18n keys (Task 4).
- Produces: `StarRating({ value, size?, className? })` display component; `ReviewForm({ productSlug, state })` client form; `ProductReviews({ productSlug, locale, city })` server component. Consumed by the product page.

- [ ] **Step 1: Create the StarRating display component**

Create `components/ui/StarRating.tsx`:

```tsx
import { Star } from 'lucide-react';

export function StarRating({ value, size = 14, className = '' }: { value: number; size?: number; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-0.5 ${className}`} aria-label={`${value} out of 5`}>
      {[1, 2, 3, 4, 5].map((index) => (
        <Star key={index} size={size} className={index <= Math.round(value) ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/40'} aria-hidden="true" />
      ))}
    </span>
  );
}
```

- [ ] **Step 2: Write the failing ReviewForm test**

Create `tests/components/ReviewForm.test.tsx`:

```tsx
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ReviewForm } from '@/components/reviews/ReviewForm';
import { renderWithProviders } from '../test-utils';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

describe('ReviewForm', () => {
  it('submits the selected rating and body, then shows the pending message', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(<ReviewForm productSlug="rose-hour" state="can-review" />);
    fireEvent.click(screen.getByRole('button', { name: /4 out of 5/i }));
    fireEvent.change(screen.getByPlaceholderText(/how was it/i), { target: { value: 'Gorgeous' } });
    fireEvent.click(screen.getByRole('button', { name: /submit review/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/account/products/rose-hour/reviews', expect.objectContaining({ method: 'POST' })));
    const [, init] = fetchMock.mock.calls[0] as [string, { body: string }];
    expect(JSON.parse(init.body)).toEqual({ rating: 4, body: 'Gorgeous' });
    expect(await screen.findByText(/pending approval/i)).toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it('shows the already-reviewed notice instead of the form', () => {
    renderWithProviders(<ReviewForm productSlug="rose-hour" state="already-reviewed" />);
    expect(screen.getByText(/already given an avis|already reviewed/i)).toBeInTheDocument();
  });

  it('shows the verified-purchase notice for unverified customers', () => {
    renderWithProviders(<ReviewForm productSlug="rose-hour" state="not-verified" />);
    expect(screen.getByText(/verified purchases/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/components/ReviewForm.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement ReviewForm**

Create `components/reviews/ReviewForm.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Star } from 'lucide-react';
import { useI18n } from '@/features/i18n/I18nProvider';

export type ReviewFormState = 'anonymous' | 'not-verified' | 'already-reviewed' | 'can-review';

export function ReviewForm({ productSlug, state }: { productSlug: string; state: ReviewFormState }) {
  const { t } = useI18n();
  const [rating, setRating] = useState(0);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);

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

  async function submit() {
    if (rating < 1 || !body.trim() || busy) return;
    setBusy(true);
    setError(false);
    const response = await fetch(`/api/account/products/${productSlug}/reviews`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rating, body: body.trim() }) });
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
      <div>
        <Button type="button" onClick={submit} disabled={busy || rating < 1 || !body.trim()}>{t('submitReview')}</Button>
      </div>
      {error ? <p className="text-sm text-destructive">{t('reviewSubmitFailed')}</p> : null}
    </div>
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/components/ReviewForm.test.tsx`
Expected: PASS.

- [ ] **Step 6: Implement ProductReviews (server component)**

Create `components/reviews/ProductReviews.tsx`:

```tsx
import { getServerSupabase } from '@/lib/supabase/server';
import { getServerT } from '@/features/i18n/server';
import { getCurrentCustomer } from '@/features/auth/customer';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { StarRating } from '@/components/ui/StarRating';
import { ReviewForm, type ReviewFormState } from './ReviewForm';
import { ratingBySlug, type ReviewRatingRow } from '@/features/reviews/aggregate';

export async function ProductReviews({ productSlug, locale }: { productSlug: string; locale: string }) {
  const { t } = await getServerT();
  const supabase = await getServerSupabase();
  if (!supabase) return null;
  const { data: product } = await supabase.from('products').select('id').eq('slug', productSlug).maybeSingle();
  if (!product) return null;

  const { data: reviewRows } = await supabase.from('product_reviews')
    .select('id,rating,body,created_at,profiles(display_name)')
    .eq('product_id', product.id)
    .eq('status', 'approved')
    .order('created_at', { ascending: false });
  const reviews = (reviewRows ?? []) as Array<{ id: string; rating: number; body: string; created_at: string; profiles?: { display_name?: string | null } | null }>;
  const aggregate = ratingBySlug(reviews.map((row): ReviewRatingRow => ({ product_slug: productSlug, rating: row.rating, status: 'approved' }))).get(productSlug);
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
    const eligibleOrder = rows.find((order) => (order.order_items ?? []).some((item) => item.product_slug === productSlug || item.product_id === product.id));
    const { data: existing } = eligibleOrder ? await getAdminSupabase().from('product_reviews').select('id').eq('order_id', eligibleOrder.id).eq('product_id', product.id).maybeSingle() : { data: null };
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
                <div className="flex items-center gap-2"><StarRating value={review.rating} />{review.profiles?.display_name ?? t('verifiedCustomer')}</div>
                <p className="mt-1 text-sm">{review.body}</p>
                <p className="mt-1 text-xs text-muted-foreground">{new Date(review.created_at).toLocaleDateString(locale === 'ar' ? 'ar-EG' : locale === 'fr' ? 'fr-FR' : 'en-GB')}</p>
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

The sign-in prompt is a plain string per the spec, so no links need `city` — the component takes only `productSlug` and `locale`.

- [ ] **Step 7: Wire the product page**

In `app/[locale]/[city]/shop/[slug]/page.tsx`, import `ProductReviews` and render it below `ProductDetail` (inside `<main>`, after the back-link + detail):

```tsx
import { ProductReviews } from '@/components/reviews/ProductReviews';
// ...
<main className="mx-auto w-[min(calc(100%-3rem),80rem)] py-12 pb-24 max-md:w-[min(calc(100%-2rem),80rem)] max-md:pt-4">
  <Link className="text-sm text-primary underline underline-offset-4" href={shopHref}>← {t('backCollection')}</Link>
  <ProductDetail product={product} />
  <ProductReviews productSlug={product.slug} locale={locale} />
</main>
```

- [ ] **Step 8: Add the rating line to ProductCard**

In `features/catalog/ProductCard.tsx`, inside the price row (`<strong className="whitespace-nowrap text-sm font-bold text-primary">`), wrap the price and add the rating under it:

```tsx
<div className="text-end">
  <strong className="whitespace-nowrap text-sm font-bold text-primary">{t('from')} {formatMoney(product.price, locale)}</strong>
  {product.rating && product.rating.count > 0 ? <p className="mt-1 text-xs text-muted-foreground">★ {product.rating.average.toFixed(1)} · {product.rating.count}</p> : null}
</div>
```

- [ ] **Step 9: Add the rating line to ProductDetail**

In `features/product/ProductDetail.tsx`, after the price line (`<p className="my-6 text-lg font-bold text-primary">`), add:

```tsx
{product.rating && product.rating.count > 0 ? <p className="-mt-4 mb-6 text-sm text-muted-foreground">★ {product.rating.average.toFixed(1)} · {product.rating.count}</p> : null}
```

- [ ] **Step 10: Run tests + typecheck**

Run: `npx vitest run tests/components/ReviewForm.test.tsx tests/domain/aggregate.test.ts`
Expected: PASS.
Run: `npm run lint`
Expected: clean, exit 0.

- [ ] **Step 11: Commit**

```bash
git add components/ui/StarRating.tsx components/reviews/ReviewForm.tsx components/reviews/ProductReviews.tsx "app/[locale]/[city]/shop/[slug]/page.tsx" features/catalog/ProductCard.tsx features/product/ProductDetail.tsx tests/components/ReviewForm.test.tsx features/i18n/dictionaries.ts
git commit -m "feat: storefront review section, form, and rating lines on cards"
```

---

### Task 6: Admin reviews queue

**Files:**
- Create: `app/admin/reviews/page.tsx`
- Modify: `components/admin/AdminShell.tsx` (sidebar entry)

**Interfaces:**
- Consumes: `reviewProductReview` (Task 3, via the admin route), `AutoRefresh` (existing), i18n keys (Task 4), `profiles` display names.

- [ ] **Step 1: Create the admin page**

Create `app/admin/reviews/page.tsx` (mirrors `app/admin/cancel-requests/page.tsx`):

```tsx
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { StatusMessage } from '@/components/ui/status-message';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AdminShell } from '@/components/admin/AdminShell';
import { AutoRefresh } from '@/components/admin/AutoRefresh';
import { ReviewQueueActions } from '@/components/admin/ReviewQueueActions';
import { StarRating } from '@/components/ui/StarRating';
import { getCurrentAdmin } from '@/features/auth/server';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { getServerT } from '@/features/i18n/server';

type ReviewRow = {
  id: string;
  rating: number;
  body: string;
  createdAt: string;
  reviewedAt: string | null;
  reviewedByName: string | null;
  product: { id: string; name_en: string } | null;
};

export default async function AdminReviewsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const admin = await getCurrentAdmin();
  if (!admin) redirect('/login');
  const { t, locale } = await getServerT();
  const params = await searchParams;
  const showApproved = params.status === 'approved';

  const supabase = getAdminSupabase();
  const select = 'id,rating,body,status,created_at,reviewed_at,reviewed_by,customer_id,products(name_en)';
  const [{ data: pendingRows }, { data: approvedRows }] = await Promise.all([
    supabase.from('product_reviews').select(select).eq('status', 'pending').order('created_at', { ascending: false }).limit(100),
    supabase.from('product_reviews').select(select).eq('status', 'approved').order('reviewed_at', { ascending: false }).limit(100),
  ]);

  const reviewerIds = [...new Set([...(pendingRows ?? []), ...(approvedRows ?? [])].map((row) => [row?.customer_id, row?.reviewed_by]).flat().filter((value): value is string => Boolean(value)))];
  const { data: profileRows } = reviewerIds.length ? await supabase.from('profiles').select('id,display_name').in('id', reviewerIds) : { data: [] };
  const profileNames = new Map((profileRows ?? []).map((profile) => [String(profile.id), String(profile.display_name ?? profile.id)]));

  const mapRow = (row: Record<string, any>): ReviewRow => ({
    id: String(row.id),
    rating: Number(row.rating),
    body: String(row.body),
    createdAt: String(row.created_at),
    reviewedAt: row.reviewed_at ? String(row.reviewed_at) : null,
    reviewedByName: row.reviewed_by ? profileNames.get(String(row.reviewed_by)) ?? null : null,
    product: row.products ? { id: String(row.products.id), name_en: String(row.products.name_en ?? '') } : null,
  });
  const pending = ((pendingRows ?? []) as Array<Record<string, any>>).map(mapRow);
  const approved = ((approvedRows ?? []) as Array<Record<string, any>>).map(mapRow);
  const rows = showApproved ? approved : pending;
  const date = (value: string) => new Date(value).toLocaleString(locale === 'ar' ? 'ar-EG' : locale === 'fr' ? 'fr-FR' : 'en-GB');

  const tabLink = 'text-sm font-bold underline-offset-4 hover:underline';
  const tabActive = 'text-primary underline';
  const tabIdle = 'text-muted-foreground';

  return <AdminShell>
    <AutoRefresh />
    <p className="text-xs font-bold uppercase tracking-[.16em] text-sage">{t('reviews')}</p>
    <h1 className="font-display text-[clamp(2rem,4vw,3rem)] leading-tight tracking-[-.02em]">{t('reviews')}</h1>

    <nav className="mt-4 flex items-center gap-6 border-b pb-2">
      <Link className={`${tabLink} ${showApproved ? tabIdle : tabActive}`} href="/admin/reviews">{t('pendingRequests', { count: pending.length })}</Link>
      <Link className={`${tabLink} ${showApproved ? tabActive : tabIdle}`} href="/admin/reviews?status=approved">{t('resolvedRequests', { count: approved.length })}</Link>
    </nav>

    {rows.length === 0 ? <StatusMessage title={showApproved ? t('noReviews') : t('noPendingReviews')} /> : <Card className="mt-4"><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>{t('products')}</TableHead><TableHead>{t('rating')}</TableHead><TableHead>{t('reviews')}</TableHead>{showApproved ? <TableHead>{t('reviewedBy')}</TableHead> : <TableHead className="text-end">{t('review')}</TableHead>}</TableRow></TableHeader><TableBody>{rows.map((review) => (
      <TableRow key={review.id}>
        <TableCell><Link className="font-medium text-primary underline-offset-4 hover:underline" href={`/admin/products/${review.product?.id ?? ''}`}>{review.product?.name_en ?? '—'}</Link><span className="block text-sm text-muted-foreground">{date(review.createdAt)}</span></TableCell>
        <TableCell><StarRating value={review.rating} /></TableCell>
        <TableCell className="max-w-md"><p className="line-clamp-3 text-sm">{review.body}</p>{review.reviewedAt ? <span className="block text-xs text-muted-foreground">{date(review.reviewedAt)}</span> : null}</TableCell>
        {showApproved ? <TableCell>{review.reviewedByName ?? '—'}</TableCell> : <TableCell className="text-end"><ReviewQueueActions reviewId={review.id} /></TableCell>}
      </TableRow>
    ))}</TableBody></Table></div></Card>}
  </AdminShell>;
}
```

- [ ] **Step 2: Create the review actions client component**

Create `components/admin/ReviewQueueActions.tsx` (mirrors `CancelRequestReview`):

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/features/i18n/I18nProvider';

export function ReviewQueueActions({ reviewId }: { reviewId: string }) {
  const router = useRouter();
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  async function review(action: 'approve' | 'reject') {
    setBusy(true);
    setError(false);
    const response = await fetch(`/api/admin/reviews/${reviewId}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) });
    if (!response.ok) { setError(true); setBusy(false); return; }
    router.refresh();
  }

  return (
    <span className="inline-flex items-center gap-2">
      <Button size="sm" onClick={() => review('approve')} disabled={busy}>{t('approveReview')}</Button>
      <Button size="sm" variant="outline" onClick={() => review('reject')} disabled={busy}>{t('rejectReview')}</Button>
      {error ? <small className="text-sm text-destructive">{t('reviewActionFailed')}</small> : null}
    </span>
  );
}
```

- [ ] **Step 3: Add the sidebar entry**

In `components/admin/AdminShell.tsx`, add to `NAV_ITEMS` after the orders entry:

```tsx
{ href: '/admin/cancel-requests', key: 'cancelRequests' },
{ href: '/admin/reviews', key: 'reviews' },
```

- [ ] **Step 4: Typecheck + build**

Run: `npm run lint`
Expected: clean, exit 0.
Run: `npm run build`
Expected: exit 0; `/admin/reviews` in the route table.

- [ ] **Step 5: Commit**

```bash
git add app/admin/reviews/page.tsx components/admin/ReviewQueueActions.tsx components/admin/AdminShell.tsx features/i18n/dictionaries.ts
git commit -m "feat: admin review moderation queue with approve/reject"
```

---

### Task 7: Full gate + merge

**Files:** none (verification only)

- [ ] **Step 1: Full test suite**

Run: `npm test`
Expected: all pass (baseline 368 + ~28 new ≈ 396).

- [ ] **Step 2: Typecheck**

Run: `npm run lint`
Expected: clean, exit 0.

- [ ] **Step 3: Production build**

Run: `npm run build`
Expected: exit 0; routes `/api/account/products/[slug]/reviews`, `/api/admin/reviews/[id]`, and page `/admin/reviews` appear in the route table.

- [ ] **Step 4: Discard generated churn**

If `next-env.d.ts` or `package-lock.json` changed, run `git checkout -- next-env.d.ts package-lock.json`.

- [ ] **Step 5: Final review + merge**

Run: `git status --short` and `git diff --stat` — confirm only feature files are present. Review the spec checklist (verified purchase, approve-first, aggregates from approved only, admin queue). Merge `master` (rebase on `origin/master` if the parallel session moved the remote, then re-run `npm run lint` + `npm test` before pushing).
