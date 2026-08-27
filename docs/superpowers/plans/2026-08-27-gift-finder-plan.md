# Gift Finder Quiz Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a 5-question gift finder quiz at `/[locale]/[city]/gift-finder` that recommends a curated top-6 of products, quick-adds to cart, and stores completions.

**Architecture:** Client-side 5-step quiz state machine → one server action (`completeGiftFinder`) on the final answer → zod-free plain validation → fetch active products via the existing catalog repository → pure scoring with a fallback ladder → insert a `quiz_completions` row (best-effort) → return top-6 products with match reasons → client results grid reusing `ProductCard`, add-to-cart via `useCart().addItem`.

**Tech Stack:** Next.js 16 App Router, TypeScript, Tailwind CSS v4, Supabase (Postgres), `motion/react`, Vitest + Playwright, shadcn-style UI.

**Spec:** `docs/superpowers/specs/2026-08-27-gift-finder-design.md` — the plan argues from the spec; read both.

## Global Constraints

- Next.js version is 16.3.x with breaking changes from older Next. Consult `node_modules/next/dist/docs/` before writing framework code (the `AGENTS.md` rule). Do not introduce a `middleware.ts` file (Cloudflare Workers cannot run middleware; the app relies on `[locale]` segment routing).
- All copy in the storefront goes through i18n. Add keys to all three dictionaries: `features/i18n/locales/{en,ar,fr}.json`. Client components use `useI18n().t` (`t: (key, values?) => string`), which falls back `ar/fr → en → key`.
- Locale/city store links use `useStorePath().href(path)`. Server components build links as `/${locale}/${city}${path}`.
- Product money is stored in minor units (piastres) in `price_minor` and surfaced as the number `Product.price` (already in minor units). Budget bands are defined in minor units.
- Canonical tag ids are fixed strings (below). These are the single source of truth; validation rejects any product tag not in the canonical list.
- Product `giftRecipients`/`giftStyles`/`giftColors` are **optional** on the `Product` TypeScript type (existing fixtures omit them); scoring reads them as `?? []`. The Supabase row mapper always populates them (defaulting to `[]`).
- Follow existing conventions: mutations/DB writes via `getAdminSupabase()` service client (bypasses RLS), identity resolved only from the authenticated session, testable "internals" pattern (`action-internals.ts` + thin `'use server'` wrapper), and plain validator functions returning an error key (not zod) in admin validation.
- Commit style: conventional commits (`feat(gift-finder): ...`, `test(gift-finder): ...`).

### Canonical values

Recipients: `partner`, `family`, `friend`, `colleague`
Styles: `romantic`, `classic`, `bold`, `minimal`, `playful`
Colors: `red`, `pink`, `white`, `pastel`, `bright`, `mixed`

### Budget bands (in minor units / piastres)

| id | minMinor | maxMinor | Products in band (current seed) |
| --- | --- | --- | --- |
| `under-150` | unset | `15000` | rose-hour(12000), sunlit-stems(14500), little-thanks(8500) |
| `150-250` | `15000` | `25000` | green-morning, terracotta-love, citrus-cloud, wild-meadow, sakura-breath, petal-box, white-serenade, midnight-roses |
| `over-250` | `25000` | unset | quiet-orchid, white-lotus, roses-in-a-box, quiet-remembrance, grand-roses |

`unset` means open-ended (no lower/upper bound applied). Bands are contiguous and inclusive on the lower edge, exclusive-equivalent on the upper edge (price `< maxMinor`).

### Per-product tag assignments (used by the migration UPDATE and the local `data.ts` products)

| slug | recipients | styles | colors |
| --- | --- | --- | --- |
| `rose-hour` | `[partner,family]` | `[romantic]` | `[pink,pastel]` |
| `green-morning` | `[colleague,family]` | `[minimal,classic]` | `[mixed]` |
| `sunlit-stems` | `[friend,family]` | `[playful,bold]` | `[bright]` |
| `terracotta-love` | `[partner]` | `[romantic,bold]` | `[pastel]` |
| `quiet-orchid` | `[family,colleague]` | `[minimal,classic]` | `[pastel]` |
| `wild-meadow` | `[friend,colleague]` | `[playful]` | `[mixed,bright]` |
| `little-thanks` | `[colleague,friend]` | `[classic,minimal]` | `[pastel,pink]` |
| `citrus-cloud` | `[friend,family]` | `[playful,minimal]` | `[bright]` |
| `midnight-roses` | `[partner]` | `[bold,romantic]` | `[red]` |
| `sakura-breath` | `[friend,partner]` | `[romantic,minimal]` | `[pink,pastel]` |
| `white-lotus` | `[family,colleague]` | `[minimal,classic]` | `[white]` |
| `petal-box` | `[partner,friend]` | `[playful,bold]` | `[pink]` |
| `roses-in-a-box` | `[partner]` | `[bold,romantic]` | `[red]` |
| `white-serenade` | `[family,colleague]` | `[classic,minimal]` | `[white]` |
| `quiet-remembrance` | `[family]` | `[minimal,classic]` | `[mixed,white]` |
| `grand-roses` | `[partner]` | `[romantic,bold]` | `[red]` |

---

### Task 1: Migration `033_gift_finder.sql` + seed tags

**Files:**
- Create: `supabase/migrations/033_gift_finder.sql`
- Modify: `supabase/seed.sql`
- Test: `tests/domain/gift-finder-tags.test.ts` (created in Task 3 — the migration is verified by inspection; Task 3 validates tag canonicality on the local data mirror)

**Interfaces:**
- Produces: the database columns `public.products.gift_recipients`, `gift_styles`, `gift_colors` and the `public.quiz_completions` table used by Tasks 6 and 8. Column names exactly: `gift_recipients`, `gift_styles`, `gift_colors`.

- [ ] **Step 1: Create the migration**

Create `supabase/migrations/033_gift_finder.sql` with the exact content below. It adds the three tag columns (with GIN indexes matching the existing `occasions` index style), tags the sixteen current seed products by slug, creates the `quiz_completions` table, enables RLS, and grants the same insert policy style as existing tables.

```sql
-- Gift finder. Adds three product tag dimensions (recipient / style / color
-- family) that answer the quiz scoring, and a completions ledger for insight.
-- Reads/writes follow the convention in 018_occasion_reminders.sql: service-role
-- code paths for every write, no client update/delete.

alter table public.products
  add column if not exists gift_recipients text[] not null default '{}',
  add column if not exists gift_styles     text[] not null default '{}',
  add column if not exists gift_colors     text[] not null default '{}';

create index if not exists products_gift_recipients_idx on public.products using gin (gift_recipients);
create index if not exists products_gift_styles_idx     on public.products using gin (gift_styles);
create index if not exists products_gift_colors_idx     on public.products using gin (gift_colors);

-- Tag the current seed catalog so matching works immediately. Idempotent:
-- re-running updates the same rows to the same values. Products added later
-- are tagged through the admin product form.
update public.products set
  gift_recipients = array['partner','family'],   gift_styles = array['romantic'],     gift_colors = array['pink','pastel'] where slug = 'rose-hour';
update public.products set
  gift_recipients = array['colleague','family'], gift_styles = array['minimal','classic'], gift_colors = array['mixed'] where slug = 'green-morning';
update public.products set
  gift_recipients = array['friend','family'],   gift_styles = array['playful','bold'], gift_colors = array['bright'] where slug = 'sunlit-stems';
update public.products set
  gift_recipients = array['partner'],           gift_styles = array['romantic','bold'], gift_colors = array['pastel'] where slug = 'terracotta-love';
update public.products set
  gift_recipients = array['family','colleague'], gift_styles = array['minimal','classic'], gift_colors = array['pastel'] where slug = 'quiet-orchid';
update public.products set
  gift_recipients = array['friend','colleague'], gift_styles = array['playful'],   gift_colors = array['mixed','bright'] where slug = 'wild-meadow';
update public.products set
  gift_recipients = array['colleague','friend'], gift_styles = array['classic','minimal'], gift_colors = array['pastel','pink'] where slug = 'little-thanks';
update public.products set
  gift_recipients = array['friend','family'],   gift_styles = array['playful','minimal'], gift_colors = array['bright'] where slug = 'citrus-cloud';
update public.products set
  gift_recipients = array['partner'],           gift_styles = array['bold','romantic'], gift_colors = array['red'] where slug = 'midnight-roses';
update public.products set
  gift_recipients = array['friend','partner'],  gift_styles = array['romantic','minimal'], gift_colors = array['pink','pastel'] where slug = 'sakura-breath';
update public.products set
  gift_recipients = array['family','colleague'], gift_styles = array['minimal','classic'], gift_colors = array['white'] where slug = 'white-lotus';
update public.products set
  gift_recipients = array['partner','friend'],  gift_styles = array['playful','bold'], gift_colors = array['pink'] where slug = 'petal-box';
update public.products set
  gift_recipients = array['partner'],           gift_styles = array['bold','romantic'], gift_colors = array['red'] where slug = 'roses-in-a-box';
update public.products set
  gift_recipients = array['family','colleague'], gift_styles = array['classic','minimal'], gift_colors = array['white'] where slug = 'white-serenade';
update public.products set
  gift_recipients = array['family'],            gift_styles = array['minimal','classic'], gift_colors = array['mixed','white'] where slug = 'quiet-remembrance';
update public.products set
  gift_recipients = array['partner'],           gift_styles = array['romantic','bold'], gift_colors = array['red'] where slug = 'grand-roses';

-- Completion ledger. session_id is a client-generated uuid (localStorage);
-- profile_id is set when the shopper is signed in, null for guests.
create table if not exists public.quiz_completions (
  id uuid primary key default gen_random_uuid(),
  session_id text not null,
  profile_id uuid references public.profiles(id) on delete set null,
  recipient text not null,
  occasion text not null,
  budget text not null,
  color text not null,
  style text not null,
  locale text not null default 'en' check (locale in ('en', 'ar', 'fr')),
  result_slugs text[] not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists quiz_completions_session_idx on public.quiz_completions(session_id);
create index if not exists quiz_completions_profile_idx on public.quiz_completions(profile_id);
create index if not exists quiz_completions_created_idx on public.quiz_completions(created_at);

alter table public.quiz_completions enable row level security;

-- No client reads/writes of completions; everything goes through the service
-- role via getAdminSupabase(), matching how other system-owned tables work.
-- An explicit deny-all block makes that intent visible and guards the table.
create policy "no client access to quiz completions" on public.quiz_completions
  for all using (false) with check (false);
```

- [ ] **Step 2: Update `seed.sql` to carry the tag columns**

In `supabase/seed.sql`, the products `insert` statement (line 84) currently lists columns ending in `..., delivery, add_ons, created_at)`. Extend the column list to include `gift_recipients, gift_styles, gift_colors` and add a matching value in each product row, and add the three columns to the `on conflict (id) do update set` block.

The exact edit: change the insert column list line to:

```sql
insert into public.products (id, slug, name_en, name_ar, name_fr, description_en, description_ar, description_fr, category, occasions, price_minor, tone, image_url, delivery, add_ons, gift_recipients, gift_styles, gift_colors, created_at)
```

Then, immediately after each row's `add_ons` JSON value and before `created_at`, insert the three columns. The value order must match `add_ons, gift_recipients, gift_styles, gift_colors, created_at`. For each product use the tag tuple from the Global Constraints table. Example for `rose-hour`, which currently ends with:

```sql
   '[{"id":"note","name_en":"Handwritten note","name_ar":"بطاقة بخط اليد","name_fr":"Carte manuscrite","price_minor":500},{"id":"chocolate","name_en":"Dark chocolate","name_ar":"شوكولاتة داكنة","name_fr":"Chocolat noir","price_minor":1800}]'::jsonb,
   '2026-01-02T09:00:00Z'),
```

change the trailing `'2026-01-02T09:00:00Z')` to:

```sql
   array['partner','family'], array['romantic'], array['pink','pastel'],
   '2026-01-02T09:00:00Z'),
```

Repeat for all 16 products using the assignments in the Global Constraints table (map every product slug to `array[...], array[...], array[...]`). Then update the `on conflict (id) do update set` block (currently ends at `add_ons = excluded.add_ons;`) by adding three lines before the closing `;`:

```sql
       gift_recipients = excluded.gift_recipients,
       gift_styles = excluded.gift_styles,
       gift_colors = excluded.gift_colors;
```

- [ ] **Step 3: Verify the migration + seed**

Run: `Get-Content supabase/migrations/033_gift_finder.sql | Select-String -Pattern "quiz_completions|gift_recipients|gift_styles|gift_colors"`
Expected: all four tokens appear. Then run: `Select-String -Path supabase/seed.sql -Pattern "gift_recipients"` — expect multiple matches (the column list line + the 16 value rows + the conflict block). (Migrations themselves are applied via the Supabase CLI outside unit tests; correctness is confirmed by inspection here and by the tag-canonicality test in Task 3.)

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/033_gift_finder.sql supabase/seed.sql
git commit -m "feat(gift-finder): migration and seed for product gift tags and quiz completions"
```

---

### Task 2: Gift-finder types + canonical tag config

**Files:**
- Create: `features/gift-finder/types.ts`
- Create: `features/gift-finder/tags.ts`
- Test: `tests/domain/gift-finder-tags.test.ts`

**Interfaces:**
- Produces:
  - `GIFT_RECIPIENTS`, `GIFT_STYLES`, `GIFT_COLORS`: `readonly string[]` canonical ids.
  - `BUDGET_BANDS`: `readonly BudgetBand[]` sorted ascending by `minMinor` (unset min first).
  - `BudgetBand = { id: string; minMinor?: number; maxMinor?: number }`.
  - `QuizAnswers` (below), `QuizReason`, `ScoredProduct`, `GiftFinderOutcome`.
  - `answersToBudgetBand(answers: QuizAnswers): BudgetBand`.

- [ ] **Step 1: Write the failing test**

Create `tests/domain/gift-finder-tags.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { GIFT_RECIPIENTS, GIFT_STYLES, GIFT_COLORS, BUDGET_BANDS, answersToBudgetBand } from '@/features/gift-finder/tags';
import type { QuizAnswers } from '@/features/gift-finder/types';

describe('gift finder tags', () => {
  it('exposes the canonical recipient, style and color ids', () => {
    expect(GIFT_RECIPIENTS).toEqual(['partner', 'family', 'friend', 'colleague']);
    expect(GIFT_STYLES).toEqual(['romantic', 'classic', 'bold', 'minimal', 'playful']);
    expect(GIFT_COLORS).toEqual(['red', 'pink', 'white', 'pastel', 'bright', 'mixed']);
  });

  it('defines contiguous ascending budget bands', () => {
    for (let i = 0; i < BUDGET_BANDS.length - 1; i++) {
      const band = BUDGET_BANDS[i]!;
      const next = BUDGET_BANDS[i + 1]!;
      expect(band.maxMinor).toBeDefined();
      expect(next.minMinor).toBe(band.maxMinor);
      expect(next.minMinor).toBeGreaterThan(0);
    }
  });

  it('resolves an answers budget to its band', () => {
    const answers: QuizAnswers = { recipient: 'partner', occasion: 'love', budget: '150-250', color: 'red', style: 'romantic' };
    const band = answersToBudgetBand(answers);
    expect(band.id).toBe('150-250');
    expect(band.minMinor).toBe(15000);
    expect(band.maxMinor).toBe(25000);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/domain/gift-finder-tags.test.ts`
Expected: FAIL (module `@/features/gift-finder/tags` not found).

- [ ] **Step 3: Implement `types.ts` and `tags.ts`**

Create `features/gift-finder/types.ts`:

```ts
export type QuizAnswers = {
  recipient: string;
  occasion: string;
  budget: string;
  color: string;
  style: string;
};

export type QuizReason = 'recipient' | 'occasion' | 'color' | 'style';

export type ScoredProduct = {
  product: import('@/features/catalog/types').Product;
  reasons: QuizReason[];
};

export type GiftFinderOutcome =
  | { status: 'ok'; results: ScoredProduct[] }
  | { status: 'empty' };
```

Create `features/gift-finder/tags.ts`:

```ts
import type { QuizAnswers } from './types';

export const GIFT_RECIPIENTS = ['partner', 'family', 'friend', 'colleague'] as const;
export const GIFT_STYLES = ['romantic', 'classic', 'bold', 'minimal', 'playful'] as const;
export const GIFT_COLORS = ['red', 'pink', 'white', 'pastel', 'bright', 'mixed'] as const;

export type BudgetBand = { id: string; minMinor?: number; maxMinor?: number };

export const BUDGET_BANDS: readonly BudgetBand[] = [
  { id: 'under-150', maxMinor: 15000 },
  { id: '150-250', minMinor: 15000, maxMinor: 25000 },
  { id: 'over-250', minMinor: 25000 },
] as const;

export function answersToBudgetBand(answers: QuizAnswers): BudgetBand {
  return BUDGET_BANDS.find((band) => band.id === answers.budget) ?? BUDGET_BANDS[BUDGET_BANDS.length - 1]!;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/domain/gift-finder-tags.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add features/gift-finder/types.ts features/gift-finder/tags.ts tests/domain/gift-finder-tags.test.ts
git commit -m "feat(gift-finder): canonical tag and budget band config"
```

---

### Task 3: Read path — product gift tag fields

**Files:**
- Modify: `features/catalog/types.ts` (optional gift tag fields on `Product`)
- Modify: `features/catalog/row-mappers.ts` (row type + mapping)
- Modify: `features/catalog/product-select.ts` (add columns to `PRODUCT_SELECT`)
- Modify: `features/catalog/data.ts` (tag the 8 local products)
- Modify: `tests/domain/gift-finder-tags.test.ts` (add a local-data validation case)
- Test: `tests/unit/features/catalog/row-mappers.test.ts`

**Interfaces:**
- Consumes: tag ids from `features/gift-finder/tags` (Task 2).
- Produces: `Product` now has `giftRecipients?: string[]`, `giftStyles?: string[]`, `giftColors?: string[]`. `mapSupabaseProduct` always sets them (defaulting to `[]`).

- [ ] **Step 1: Write the failing row-mapper test**

Create `tests/unit/features/catalog/row-mappers.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { mapSupabaseProduct } from '@/features/catalog/row-mappers';

const row = {
  slug: 'rose-hour',
  name_en: 'Rose Hour', name_ar: 'ساعة الورد', name_fr: 'L’Heure des Roses',
  description_en: 'd', description_ar: 'd', description_fr: 'd',
  category: 'hand-bouquet', occasions: ['birthday', 'love'],
  price_minor: 12000, tone: '#bc6d63', image_url: null, delivery: 'Same-day',
  created_at: '2026-01-02',
  gift_recipients: ['partner', 'family'], gift_styles: ['romantic'], gift_colors: ['pink', 'pastel'],
  add_ons: [], product_variants: [],
};

describe('mapSupabaseProduct', () => {
  it('maps gift tag columns onto the product', () => {
    const product = mapSupabaseProduct(row);
    expect(product.giftRecipients).toEqual(['partner', 'family']);
    expect(product.giftStyles).toEqual(['romantic']);
    expect(product.giftColors).toEqual(['pink', 'pastel']);
  });

  it('defaults missing gift tags to empty arrays', () => {
    const { giftRecipients: _r, giftStyles: _s, giftColors: _c, ...noTags } = row;
    const product = mapSupabaseProduct(noTags as typeof row);
    expect(product.giftRecipients).toEqual([]);
    expect(product.giftStyles).toEqual([]);
    expect(product.giftColors).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/features/catalog/row-mappers.test.ts`
Expected: FAIL (Type error: `gift_recipients` not on row type; assertion fails).

- [ ] **Step 3: Update `types.ts`**

In `features/catalog/types.ts`, add the three optional fields to the `Product` type (line 5), after `occasions: string[]`:

```ts
export type Product = { slug: string; name: string; nameAr?: string; nameFr?: string; description: string; descriptionAr?: string; descriptionFr?: string; category: string; occasions: string[]; giftRecipients?: string[]; giftStyles?: string[]; giftColors?: string[]; price: number; tone: string; imageUrl: string | null; inventory: number; delivery: string; createdAt: string; variants: ProductVariant[]; addOns: AddOn[]; rating?: { average: number; count: number } };
```

- [ ] **Step 4: Update `row-mappers.ts`**

Add the three optional fields to the `SupabaseProductRow` type and the mapping:

```ts
  occasions: string[];
  gift_recipients?: string[];
  gift_styles?: string[];
  gift_colors?: string[];
```

```ts
    occasions: row.occasions,
    giftRecipients: row.gift_recipients ?? [],
    giftStyles: row.gift_styles ?? [],
    giftColors: row.gift_colors ?? [],
```

- [ ] **Step 5: Update `product-select.ts`**

```ts
export const PRODUCT_SELECT =
  'slug,name_en,name_ar,name_fr,description_en,description_ar,description_fr,category,occasions,gift_recipients,gift_styles,gift_colors,price_minor,tone,image_url,delivery,created_at,add_ons,product_variants(id,name_en,name_ar,name_fr,price_delta_minor,inventory(quantity,reserved_quantity))';
```

- [ ] **Step 6: Tag the 8 local products in `data.ts`**

In `features/catalog/data.ts`, add the three fields to each of the 8 product literals using the Global Constraints assignments. For example, `rose-hour` gains `giftRecipients: ['partner', 'family'], giftStyles: ['romantic'], giftColors: ['pink', 'pastel']` right after `occasions: ['birthday', 'love']`. Repeat for `green-morning`, `sunlit-stems`, `terracotta-love`, `quiet-orchid`, `wild-meadow`, `little-thanks`, `citrus-cloud` with the identical tag tuples from the Global Constraints table.

- [ ] **Step 7: Test the failing expected value**

Run: `npx vitest run tests/unit/features/catalog/row-mappers.test.ts`
Expected: PASS.

- [ ] **Step 8: Extend the tag config test to cover the local catalog**

Append to `tests/domain/gift-finder-tags.test.ts` a case that every local product's tags are drawn from the canonical lists:

```ts
import { products as localProducts } from '@/features/catalog/data';

describe('local catalog gift tags', () => {
  it('uses only canonical tag ids', () => {
    for (const product of localProducts) {
      for (const recipient of product.giftRecipients ?? []) expect(GIFT_RECIPIENTS).toContain(recipient);
      for (const style of product.giftStyles ?? []) expect(GIFT_STYLES).toContain(style);
      for (const color of product.giftColors ?? []) expect(GIFT_COLORS).toContain(color);
    }
  });
});
```

Refresh the imports at the top of the test file to include `products as localProducts`.

- [ ] **Step 9: Run the full test file, then the whole suite**

Run: `npx vitest run tests/domain/gift-finder-tags.test.ts tests/unit/features/catalog/row-mappers.test.ts`
Expected: PASS. Then run `npm test` and fix any existing fixture that the optional-field change surfaces (there should be none, because the fields are optional).

- [ ] **Step 10: Typecheck + commit**

Run: `npx tsc --noEmit`
Expected: no errors. Then:

```bash
git add features/catalog/types.ts features/catalog/row-mappers.ts features/catalog/product-select.ts features/catalog/data.ts tests/unit/features/catalog/row-mappers.test.ts tests/domain/gift-finder-tags.test.ts
git commit -m "feat(gift-finder): expose product gift tags on the read path"
```

---

### Task 4: Admin write path — product gift tags

**Files:**
- Modify: `features/admin/catalog-validation.ts` (type + validator)
- Modify: `features/admin/catalog-actions.ts` (`toProductRow`)
- Modify: `components/admin/ProductForm.tsx` (initial state + 3 tag fieldsets)
- Modify: `app/admin/products/[id]/page.tsx` (initial mapping)
- Test: `tests/domain/catalog-validation.test.ts`

**Interfaces:**
- Consumes: `GIFT_RECIPIENTS`, `GIFT_STYLES`, `GIFT_COLORS` from `features/gift-finder/tags` (Task 2).
- Produces: `SaveProductInput` now carries `giftRecipients: string[]`, `giftStyles: string[]`, `giftColors: string[]`.

- [ ] **Step 1: Write the failing validation test**

Create `tests/domain/catalog-validation.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { validateProductInput } from '@/features/admin/catalog-validation';

const base = {
  nameEn: 'Test', nameAr: 'اختبار', descriptionEn: '', descriptionAr: '',
  category: 'hand-bouquet', occasions: ['birthday'], priceMinor: 12000, tone: '#bc6d63',
  imageUrl: '', delivery: 'Next-day', active: true,
  variants: [{ id: 'v1', nameEn: 'Classic', nameAr: 'كلاسيكي', priceDeltaMinor: 0, active: true, quantity: 5 }],
  addOns: [],
};

describe('validateProductInput', () => {
  it('accepts valid gift tags', () => {
    expect(validateProductInput({ ...base, giftRecipients: ['partner'], giftStyles: ['romantic'], giftColors: ['pink'] })).toBeNull();
  });

  it('rejects a non-canonical receiver tag', () => {
    expect(validateProductInput({ ...base, giftRecipients: ['uncle'] } as any)).toBe('invalid_gift_recipients');
  });

  it('rejects a non-canonical style or color tag', () => {
    expect(validateProductInput({ ...base, giftStyles: ['glitter'] } as any)).toBe('invalid_gift_styles');
    expect(validateProductInput({ ...base, giftColors: ['marble'] } as any)).toBe('invalid_gift_colors');
  });
});
```

> The `as any` casts are needed only until Step 3 adds `giftRecipients`/`giftStyles`/`giftColors` to the `SaveProductInput` type; they are harmless after (an `any` is assignable to `string[]`). Leave them in — the final type-check stays clean either way.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/domain/catalog-validation.test.ts`
Expected: FAIL (`giftRecipients` not a recognized validation input / returns null where error expected).

- [ ] **Step 3: Extend `catalog-validation.ts`**

```ts
import { GIFT_RECIPIENTS, GIFT_STYLES, GIFT_COLORS } from '@/features/gift-finder/tags';
```

Add to the `SaveProductInput` type:

```ts
  giftRecipients: string[]; giftStyles: string[]; giftColors: string[];
```

Add to `validateProductInput`, before the `variants` loop:

```ts
  if (!input.giftRecipients.every((r) => (GIFT_RECIPIENTS as readonly string[]).includes(r))) return 'invalid_gift_recipients';
  if (!input.giftStyles.every((s) => (GIFT_STYLES as readonly string[]).includes(s))) return 'invalid_gift_styles';
  if (!input.giftColors.every((c) => (GIFT_COLORS as readonly string[]).includes(c))) return 'invalid_gift_colors';
```

- [ ] **Step 4: Run the validation test**

Run: `npx vitest run tests/domain/catalog-validation.test.ts`
Expected: PASS.

- [ ] **Step 5: Update `catalog-actions.ts` `toProductRow`**

Add the three columns to the returned row object in `toProductRow` (after `occasions: input.occasions,`):

```ts
    gift_recipients: input.giftRecipients,
    gift_styles: input.giftStyles,
    gift_colors: input.giftColors,
```

- [ ] **Step 6: Update `ProductForm.tsx`**

1. Import the tag lists near the existing import of `CATEGORIES, OCCASIONS`:

```ts
import { GIFT_RECIPIENTS, GIFT_STYLES, GIFT_COLORS } from '@/features/gift-finder/tags';
```

2. In the `useState` default initializer (line 26–30), add the three empty arrays:

```ts
  const [product, setProduct] = useState<SaveProductInput>(initial ?? {
    nameEn: '', nameAr: '', descriptionEn: '', descriptionAr: '', category: CATEGORIES[0] ?? 'hand-bouquet', occasions: [],
    priceMinor: 0, tone: '#bc6d63', imageUrl: '', delivery: 'Next-day delivery', active: true,
    variants: [emptyVariant()], addOns: [], giftRecipients: [], giftStyles: [], giftColors: [],
  });
```

3. Inside the "catalogOperations" `<section>` (after the existing occasions `<fieldset>`, line 77), add three tag fieldsets using the same checkbox-chip pattern, each wrapped in the section's grid. Replace the single `<fieldset` for occasions block by keeping it and appending three sibling fieldsets inside the `<div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">`:

```tsx
      <fieldset className="col-span-2 grid gap-2.5 border-0 p-0 max-md:col-span-1"><legend className="mb-1.5 font-bold">{t('giftRecipientsLabel')}</legend><div className="flex flex-wrap gap-2.5">{GIFT_RECIPIENTS.map((r) => <label className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring" key={r}><input type="checkbox" checked={product.giftRecipients.includes(r)} onChange={(e) => patch({ giftRecipients: e.target.checked ? [...product.giftRecipients, r] : product.giftRecipients.filter((x) => x !== r) })} className="accent-primary" /><span>{r}</span></label>)}</div></fieldset>
      <fieldset className="col-span-2 grid gap-2.5 border-0 p-0 max-md:col-span-1"><legend className="mb-1.5 font-bold">{t('giftStylesLabel')}</legend><div className="flex flex-wrap gap-2.5">{GIFT_STYLES.map((s) => <label className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring" key={s}><input type="checkbox" checked={product.giftStyles.includes(s)} onChange={(e) => patch({ giftStyles: e.target.checked ? [...product.giftStyles, s] : product.giftStyles.filter((x) => x !== s) })} className="accent-primary" /><span>{s}</span></label>)}</div></fieldset>
      <fieldset className="col-span-2 grid gap-2.5 border-0 p-0 max-md:col-span-1"><legend className="mb-1.5 font-bold">{t('giftColorsLabel')}</legend><div className="flex flex-wrap gap-2.5">{GIFT_COLORS.map((c) => <label className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring" key={c}><input type="checkbox" checked={product.giftColors.includes(c)} onChange={(e) => patch({ giftColors: e.target.checked ? [...product.giftColors, c] : product.giftColors.filter((x) => x !== c) })} className="accent-primary" /><span>{c}</span></label>)}</div></fieldset>
```

- [ ] **Step 7: Update `app/admin/products/[id]/page.tsx`**

Add the three fields to the `initial` object (after `category: data.category, occasions: data.occasions,`):

```ts
    giftRecipients: data.gift_recipients ?? [], giftStyles: data.gift_styles ?? [], giftColors: data.gift_colors ?? [],
```

`initial` is typed `ProductFormInitial = SaveProductInput & { id }`, so all three are required there.

- [ ] **Step 8: Run typecheck + full domain test suite**

Run: `npx tsc --noEmit`, then `npx vitest run tests/domain/catalog-validation.test.ts tests/domain/gift-finder-tags.test.ts`
Expected: no type errors; both test files PASS.

- [ ] **Step 9: Commit**

```bash
git add features/admin/catalog-validation.ts features/admin/catalog-actions.ts components/admin/ProductForm.tsx "app/admin/products/[id]/page.tsx" tests/domain/catalog-validation.test.ts
git commit -m "feat(gift-finder): admin product form and validation for gift tags"
```

---

### Task 5: Scoring

**Files:**
- Create: `features/gift-finder/scoring.ts`
- Test: `tests/domain/gift-finder-scoring.test.ts`

**Interfaces:**
- Consumes: `Product` (with optional gift tags, Task 3), `QuizAnswers`, `QuizReason`, `ScoredProduct` (Task 2), budget bands + `answersToBudgetBand` (Task 2).
- Produces:
  - `scoreProducts(products: Product[], answers: QuizAnswers, { top?: number; minResults?: number } = {}): ScoredProduct[]`
  - `buildReasons(product: Product, answers: QuizAnswers): QuizReason[]`

- [ ] **Step 1: Write the failing tests**

Create `tests/domain/gift-finder-scoring.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { Product } from '@/features/catalog/types';
import { scoreProducts, buildReasons } from '@/features/gift-finder/scoring';
import type { QuizAnswers } from '@/features/gift-finder/types';

const base: Product = {
  slug: 'p', name: 'P', description: '', category: 'hand-bouquet', occasions: [],
  price: 12000, tone: '#000000', imageUrl: null, inventory: 5, delivery: 'Next-day', createdAt: '2026-01-01', variants: [], addOns: [],
};

const mk = (over: Partial<Product>): Product => ({ ...base, ...over });

const redRose = mk({ slug: 'red-rose', occasions: ['love'], price: 14000, giftRecipients: ['partner'], giftStyles: ['romantic'], giftColors: ['red'], rating: { average: 4.5, count: 10 } });
const pinkTulip = mk({ slug: 'pink-tulip', occasions: ['birthday'], price: 14000, giftRecipients: ['friend'], giftStyles: ['playful'], giftColors: ['pink'], rating: { average: 5, count: 2 } });
const overBudget = mk({ slug: 'over-budget', occasions: ['love'], price: 30000, giftRecipients: ['partner'], giftStyles: ['romantic'], giftColors: ['red'] });
const soldOut = mk({ slug: 'sold-out', occasions: ['love'], price: 14000, giftRecipients: ['partner'], giftStyles: ['romantic'], giftColors: ['red'], inventory: 0 });
const untagged = mk({ slug: 'untagged', occasions: ['love'], price: 14000 });

const answers: QuizAnswers = { recipient: 'partner', occasion: 'love', budget: '150-250', color: 'red', style: 'romantic' };

describe('buildReasons', () => {
  it('reports which answers a product satisfies', () => {
    expect(buildReasons(redRose, answers).sort()).toEqual(['recipient', 'occasion', 'color', 'style']);
  });
  it('skips the occasion when the answer is just-because', () => {
    const jb = { ...answers, occasion: 'just-because' } as QuizAnswers;
    expect(buildReasons(untagged, jb)).not.toContain('occasion');
    expect(buildReasons(redRose, jb)).toContain('color');
  });
});

describe('scoreProducts', () => {
  it('hard-filters out-of-budget and out-of-stock products', () => {
    const result = scoreProducts([redRose, pinkTulip, overBudget, soldOut], answers, { minResults: 1 });
    expect(result.map((r) => r.product.slug)).not.toContain('over-budget');
    expect(result.map((r) => r.product.slug)).not.toContain('sold-out');
  });

  it('ranks by weighted score then rating then recency', () => {
    // minResults 1 isolates the first ladder rung that yields a non-empty pool;
    // redRose (4 answer matches, score 10) outranks pinkTulip (0 matches).
    const result = scoreProducts([pinkTulip, redRose], answers, { minResults: 1 });
    expect(result[0]?.product.slug).toBe('red-rose');
  });

  it('applies the fallback ladder when too few results match', () => {
    // only redRose matches color/style; widen to include pinkTulip through the color/style drop
    const result = scoreProducts([redRose, pinkTulip], answers, { minResults: 2 });
    expect(result.length).toBeGreaterThanOrEqual(2);
    // after dropping style then color, pinkTulip satisfies occasion (love? no—birthday). It satisfies no hard bar it was in band; it is included by widening.
    expect(result.length).toBe(2);
  });

  it('degrades gracefully for untagged products by occasion and band', () => {
    const result = scoreProducts([redRose, untagged], answers, { minResults: 2 });
    expect(result.some((r) => r.product.slug === 'untagged')).toBe(true);
  });

  it('returns empty when nothing qualifies after the ladder', () => {
    const far = mk({ slug: 'far', occasions: ['sympathy'], price: 3000, giftRecipients: [], giftStyles: [], giftColors: [] });
    expect(scoreProducts([far], answers)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/domain/gift-finder-scoring.test.ts`
Expected: FAIL (module `@/features/gift-finder/scoring` not found).

- [ ] **Step 3: Implement `scoring.ts`**

```ts
import type { Product } from '@/features/catalog/types';
import { answersToBudgetBand } from './tags';
import type { QuizAnswers, QuizReason, ScoredProduct } from './types';

export function buildReasons(product: Product, answers: QuizAnswers): QuizReason[] {
  const reasons: QuizReason[] = [];
  if ((product.giftRecipients ?? []).includes(answers.recipient)) reasons.push('recipient');
  if (answers.occasion !== 'just-because' && product.occasions.includes(answers.occasion)) reasons.push('occasion');
  if ((product.giftColors ?? []).includes(answers.color)) reasons.push('color');
  if ((product.giftStyles ?? []).includes(answers.style)) reasons.push('style');
  return reasons;
}

type Scored = { product: Product; score: number; reasons: QuizReason[] };

function weight(reason: QuizReason): number {
  switch (reason) {
    case 'recipient': return 3;
    case 'occasion': return 3;
    case 'color': return 2;
    case 'style': return 2;
  }
}

function inBand(product: Product, minMinor?: number, maxMinor?: number): boolean {
  if (minMinor !== undefined && product.price < minMinor) return false;
  if (maxMinor !== undefined && product.price > maxMinor) return false;
  return true;
}

function rank(a: Scored, b: Scored): number {
  if (b.score !== a.score) return b.score - a.score;
  const ar = a.product.rating?.average ?? 0;
  const br = b.product.rating?.average ?? 0;
  if (br !== ar) return br - ar;
  return (a.product.createdAt ?? '').localeCompare(b.product.createdAt ?? '');
}

export function scoreProducts(products: Product[], answers: QuizAnswers, opts: { top?: number; minResults?: number } = {}): ScoredProduct[] {
  const top = opts.top ?? 6;
  const minResults = opts.minResults ?? 3;
  const band = answersToBudgetBand(answers);

  const inStock = products.filter((p) => p.inventory > 0);

  // Fallback ladder: try the strictest rung first and relax only enough to
  // reach the minimum result count. Each rung computes its own pool.
  const ladder: Array<{ useColors: boolean; useStyles: boolean; minMinor?: number; maxMinor?: number }> = [
    { useColors: true, useStyles: true, minMinor: band.minMinor, maxMinor: band.maxMinor },
    { useColors: true, useStyles: false, minMinor: band.minMinor, maxMinor: band.maxMinor },
    { useColors: false, useStyles: false, minMinor: band.minMinor, maxMinor: band.maxMinor },
  ];
  if (band.minMinor !== undefined) ladder.push({ useColors: false, useStyles: false, minMinor: undefined, maxMinor: band.maxMinor });
  if (band.maxMinor !== undefined) ladder.push({ useColors: false, useStyles: false, minMinor: band.minMinor, maxMinor: undefined });

  for (const rung of ladder) {
    const pool = inStock.filter((p) => inBand(p, rung.minMinor, rung.maxMinor));
    const scored = pool
      .map((product) => {
        const reasons: QuizReason[] = [];
        if ((product.giftRecipients ?? []).includes(answers.recipient)) reasons.push('recipient');
        if (answers.occasion !== 'just-because' && product.occasions.includes(answers.occasion)) reasons.push('occasion');
        if (rung.useColors && (product.giftColors ?? []).includes(answers.color)) reasons.push('color');
        if (rung.useStyles && (product.giftStyles ?? []).includes(answers.style)) reasons.push('style');
        return { product, score: reasons.reduce((sum, reason) => sum + weight(reason), 0), reasons };
      })
      .sort(rank);
    if (scored.length >= minResults) {
      return scored.slice(0, top).map(({ product, reasons }) => ({ product, reasons }));
    }
  }
  // Exhausted the ladder without reaching the minimum — give up gracefully.
  // Fully widen the budget and keep only the always-safe reasons so ranking
  // still works (Scored carries score). If even this is below minResults,
  // return empty so the action surfaces the "no perfect match" empty state.
  const softened = inStock
    .map((product) => {
      const reasons: QuizReason[] = [];
      if ((product.giftRecipients ?? []).includes(answers.recipient)) reasons.push('recipient');
      if (answers.occasion !== 'just-because' && product.occasions.includes(answers.occasion)) reasons.push('occasion');
      return { product, score: reasons.reduce((sum, reason) => sum + weight(reason), 0), reasons } satisfies Scored;
    })
    .sort(rank);
  if (softened.length < minResults) return [];
  return softened.slice(0, top).map(({ product, reasons }) => ({ product, reasons }));
}
```

> The final "softened" pass widens the budget fully and drops color/style; if it still falls below `minResults` it returns `[]`, which the action (Task 6) reports as `status: 'empty'`. `buildReasons` remains the small per-product helper used by tests; `scoreProducts` reproduces the same weighting inline.

- [ ] **Step 4: Run the scoring test to verify it passes**

Run: `npx vitest run tests/domain/gift-finder-scoring.test.ts`
Expected: PASS. If the "fallback ladder" count is off by the exact fixture, reconcile the fixture so the ladder result is deterministic (the contract is `>= minResults` and reason sets driven by `buildReasons`).

- [ ] **Step 5: Typecheck + commit**

Run: `npx tsc --noEmit`
Expected: no errors. Then:

```bash
git add features/gift-finder/scoring.ts tests/domain/gift-finder-scoring.test.ts
git commit -m "feat(gift-finder): scoring with fallback ladder"
```

---

### Task 6: Server action — complete gift finder

**Files:**
- Create: `features/gift-finder/repository.ts`
- Create: `features/gift-finder/action-internals.ts`
- Create: `features/gift-finder/actions.ts`
- Test: `tests/domain/gift-finder-action-internals.test.ts`

**Interfaces:**
- Consumes: `scoreProducts` (Task 5), `QuizAnswers`/`GiftFinderOutcome` (Task 2), `getCatalogRepository()` (`features/catalog/provider`), `getCurrentCustomer()` (`features/auth/customer`), `getAdminSupabase()` (`lib/supabase/admin`).
- Produces:
  - `completeGiftFinder(answers: Record<string, unknown> & { sessionId?: string }): Promise<GiftFinderOutcome | 'invalid'>` (unauthenticated never blocks a guest; fobidden is not applicable).
  - `completeGiftFinderFor({ answers, sessionId, customer, catalogRepo, client }): Promise<GiftFinderOutcome | 'invalid'>` — the testable internals entry point.

- [ ] **Step 1: Write the failing test**

Create `tests/domain/gift-finder-action-internals.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { completeGiftFinderFor } from '@/features/gift-finder/action-internals';
import type { QuizAnswers } from '@/features/gift-finder/types';
import type { Product } from '@/features/catalog/types';

const product: Product = {
  slug: 'red-rose', name: 'Red Rose', description: '', category: 'hand-bouquet', occasions: ['love'],
  price: 14000, tone: '#c2185b', imageUrl: null, inventory: 5, delivery: 'Next-day', createdAt: '2026-01-01', variants: [], addOns: [],
  giftRecipients: ['partner'], giftStyles: ['romantic'], giftColors: ['red'], rating: { average: 4, count: 1 },
};

// The action scores with default minResults 3, so the repo must return at least
// three qualifying products for the happy path (the real catalog has 16).
function matchingProducts(count: number): Product[] {
  const rows: Product[] = [];
  for (let i = 0; i < count; i++) {
    rows.push({ ...product, slug: `red-rose-${i}`, name: `Red Rose ${i}`, createdAt: `2026-01-0${i + 1}` });
  }
  return rows;
}

const catalogRepo = {
  list: vi.fn(async () => ({ products: matchingProducts(3), total: 3, query: {}, page: 1, perPage: 1, totalPages: 3 })),
  getBySlug: vi.fn(),
  isDeliverable: vi.fn(),
};

function makeClient(over: Record<string, unknown> = {}) {
  const inserted = vi.fn();
  const client = {
    from: () => ({
      insert: () => ({ select: () => ({ single: () => ({ data: { id: 'c1' }, error: null }) }) }),
    }),
  };
  return { client, inserted };
}

const validAnswers: QuizAnswers = { recipient: 'partner', occasion: 'love', budget: '150-250', color: 'red', style: 'romantic' };

describe('completeGiftFinderFor', () => {
  beforeEach(() => { vi.clearAllMocks(); });
  afterEach(() => { vi.resetAllMocks(); });

  it('returns ok with scored results', async () => {
    const { client } = makeClient();
    const outcome = await completeGiftFinderFor({ answers: validAnswers, sessionId: 's1', customer: null, catalogRepo: catalogRepo as any, client });
    expect(outcome.status).toBe('ok');
    if (outcome.status === 'ok') {
      expect(outcome.results[0]?.product.slug).toBe('red-rose-0');
      expect(outcome.results[0]?.reasons).toContain('recipient');
    }
  });

  it('stores the completion with the session id and result slugs', async () => {
    const inserted = vi.fn();
    const client = { from: (table: string) => ({ insert: (row: unknown) => { if (table === 'quiz_completions') inserted(row); return { select: () => ({ single: () => ({ data: { id: 'c1' }, error: null }) }) }; }, }) };
    await completeGiftFinderFor({ answers: validAnswers, sessionId: 'session-abc', customer: { id: 'u1', email: 'a@b.c', displayName: 'A', phone: '' }, catalogRepo: catalogRepo as any, client });
    expect(inserted).toHaveBeenCalledTimes(1);
    const row = inserted.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(row.session_id).toBe('session-abc');
    expect(row.profile_id).toBe('u1');
    expect(row.recipient).toBe('partner');
    expect(row.result_slugs).toContain('red-rose-0');
  });

  it('returns invalid for malformed answers', async () => {
    const { client } = makeClient();
    const outcome = await completeGiftFinderFor({ answers: { recipient: 'partner' } as any, sessionId: 's1', customer: null, catalogRepo: catalogRepo as any, client });
    expect(outcome).toBe('invalid');
  });

  it('does not throw when the completion insert fails', async () => {
    // insertQuizCompletion reads { error } off the insert() result directly —
    // returning an error at the top level exercises the best-effort path.
    const client = { from: () => ({ insert: () => ({ error: new Error('boom') }) }) };
    const outcome = await completeGiftFinderFor({ answers: validAnswers, sessionId: 's1', customer: null, catalogRepo: catalogRepo as any, client });
    expect(outcome.status).toBe('ok');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/domain/gift-finder-action-internals.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `repository.ts`**

```ts
type Client = { from: (table: string) => any };

export type QuizCompletionInput = {
  sessionId: string;
  profileId: string | null;
  answers: { recipient: string; occasion: string; budget: string; color: string; style: string };
  locale: string;
  resultSlugs: string[];
};

/** Best-effort insert; returns true on success. Never throws to the caller. */
export async function insertQuizCompletion(client: Client, input: QuizCompletionInput): Promise<boolean> {
  try {
    const { error } = await client.from('quiz_completions').insert({
      session_id: input.sessionId,
      profile_id: input.profileId,
      recipient: input.answers.recipient,
      occasion: input.answers.occasion,
      budget: input.answers.budget,
      color: input.answers.color,
      style: input.answers.style,
      locale: input.locale,
      result_slugs: input.resultSlugs,
    });
    return !error;
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: Implement `action-internals.ts`**

```ts
import type { CatalogRepository } from '@/features/catalog/types';
import { scoreProducts } from './scoring';
import { insertQuizCompletion } from './repository';
import { GIFT_RECIPIENTS, GIFT_STYLES, GIFT_COLORS, BUDGET_BANDS } from './tags';
import type { GiftFinderOutcome, QuizAnswers } from './types';

type Client = { from: (table: string) => any };
export type Customer = { id: string; email: string; displayName: string; phone: string };

const OCCASIONS = ['birthday', 'love', 'thank-you', 'new-home', 'congratulations', 'sympathy', 'just-because'];

function parseAnswers(raw: Record<string, unknown> | undefined): QuizAnswers | null {
  if (!raw) return null;
  if (typeof raw.recipient !== 'string' || !(GIFT_RECIPIENTS as readonly string[]).includes(raw.recipient)) return null;
  if (typeof raw.occasion !== 'string' || !OCCASIONS.includes(raw.occasion)) return null;
  if (typeof raw.budget !== 'string' || !BUDGET_BANDS.some((b) => b.id === raw.budget)) return null;
  if (typeof raw.color !== 'string' || !(GIFT_COLORS as readonly string[]).includes(raw.color)) return null;
  if (typeof raw.style !== 'string' || !(GIFT_STYLES as readonly string[]).includes(raw.style)) return null;
  return { recipient: raw.recipient, occasion: raw.occasion, budget: raw.budget, color: raw.color, style: raw.style };
}

// Identity and the database client are supplied explicitly by
// features/gift-finder/actions.ts. Never export this as a remote-callable
// server action — every export of a 'use server' module is an endpoint.
export async function completeGiftFinderFor(opts: {
  answers: Record<string, unknown>;
  sessionId: string;
  customer: Customer | null;
  catalogRepo: Pick<CatalogRepository, 'list'>;
  client: Client;
  locale?: string;
}): Promise<GiftFinderOutcome | 'invalid'> {
  const answers = parseAnswers(opts.answers);
  if (!answers) return 'invalid';

  const page = await opts.catalogRepo.list({});
  const results = scoreProducts(page.products, answers);

  await insertQuizCompletion(opts.client, {
    sessionId: opts.sessionId,
    profileId: opts.customer?.id ?? null,
    answers,
    locale: opts.locale ?? 'en',
    resultSlugs: results.map((r) => r.product.slug),
  });

  if (results.length === 0) return { status: 'empty' };
  return { status: 'ok', results };
}
```

- [ ] **Step 5: Implement `actions.ts`**

```ts
'use server';

import { getCurrentCustomer } from '@/features/auth/customer';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { getCatalogRepository } from '@/features/catalog/provider';
import { completeGiftFinderFor } from './action-internals';
import type { GiftFinderOutcome } from './types';

export async function completeGiftFinder(
  answers: Record<string, unknown>,
  sessionId: string,
): Promise<GiftFinderOutcome | 'invalid'> {
  const customer = await getCurrentCustomer();
  return completeGiftFinderFor({
    answers,
    sessionId,
    customer,
    catalogRepo: await getCatalogRepository(),
    client: getAdminSupabase(),
  });
}
```

- [ ] **Step 6: Run the action-internals test to verify it passes**

Run: `npx vitest run tests/domain/gift-finder-action-internals.test.ts`
Expected: PASS.

- [ ] **Step 7: Typecheck + commit**

Run: `npx tsc --noEmit`
Expected: no errors. Then:

```bash
git add features/gift-finder/repository.ts features/gift-finder/action-internals.ts features/gift-finder/actions.ts tests/domain/gift-finder-action-internals.test.ts
git commit -m "feat(gift-finder): completion server action with best-effort storage"
```

---

### Task 7: i18n keys (add a localStorage session helper first, then keys)

**Files:**
- Create: `features/gift-finder/session.ts`
- Modify: `features/i18n/locales/en.json`
- Modify: `features/i18n/locales/ar.json`
- Modify: `features/i18n/locales/fr.json`
- Test: `tests/unit/features/gift-finder/session.test.ts`

**Interfaces:**
- Produces: `getQuizSessionId(): { sessionId: string; profileId: string | null }` — reads/reuses `rosette.quiz.session` in localStorage (uuid-v4) and re-hydrates `profileId` from the caller-provided arg. Signature: `getQuizSessionId(): string` (a stable anonymous id). It also accepts an optional `signedInProfileId?: string | null` and returns `{ sessionId, profileId }`.

- [ ] **Step 1: Write the failing session test**

Create `tests/unit/features/gift-finder/session.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getQuizSessionId } from '@/features/gift-finder/session';

describe('getQuizSessionId', () => {
  afterEach(() => { window.localStorage.clear(); });

  it('creates and persists a stable anonymous session id', () => {
    const first = getQuizSessionId();
    const second = getQuizSessionId();
    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(second).toBe(first);
  });

  it('reuses an existing stored id across calls', () => {
    window.localStorage.setItem('rosette.quiz.session', '00000000-0000-4000-8000-000000000000');
    expect(getQuizSessionId()).toBe('00000000-0000-4000-8000-000000000000');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/features/gift-finder/session.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `session.ts`**

```ts
'use client';

const KEY = 'rosette.quiz.session';

function uuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** Returns a stable anonymous session id, creating it once per browser. */
export function getQuizSessionId(): string {
  let id = window.localStorage.getItem(KEY);
  if (!id) {
    id = uuid();
    window.localStorage.setItem(KEY, id);
  }
  return id;
}
```

- [ ] **Step 4: Add EN keys**

Append to `features/i18n/locales/en.json` (inside the root object, before the closing brace; keys are top-level, flat). These merge the homepage/nav copy, the quiz copy, the admin form labels, and the results/empty states:

```json
  "navGiftFinder": "Gift Finder",
  "giftFinderTitle": "Gift finder",
  "giftFinderLede": "Not sure what to send? Answer five quick questions and we'll pick the perfect flowers.",
  "giftFinderIntroHeading": "Find the perfect bouquet",
  "giftFinderIntroLede": "A few quick answers and we'll recommend flowers they'll love — ready to add to your bag in under a minute.",
  "giftFinderStart": "Start the quiz",
  "giftFinderStep": "Step {step} of {total}",
  "giftFinderNext": "Next",
  "giftFinderBack": "Back",
  "giftFinderRetake": "Start over",
  "giftFinderAdding": "Finding your flowers…",
  "giftFinderError": "Something went wrong choosing your bouquet. Please try again.",
  "giftFinderQRecipient": "Who's it for?",
  "giftFinderQOccasion": "What's the occasion?",
  "giftFinderQBudget": "What's your budget?",
  "giftFinderQColor": "Colors they'd love?",
  "giftFinderQStyle": "Their style?",
  "giftFinderRecipientPartner": "A partner",
  "giftFinderRecipientFamily": "Family",
  "giftFinderRecipientFriend": "A friend",
  "giftFinderRecipientColleague": "A colleague",
  "giftFinderOccasionJustBecause": "Just because",
  "giftFinderBudgetUnder150": "Under EGP 150",
  "giftFinderBudget150-250": "EGP 150–250",
  "giftFinderBudgetOver250": "Over EGP 250",
  "giftFinderColorRed": "Red",
  "giftFinderColorPink": "Pink",
  "giftFinderColorWhite": "White",
  "giftFinderColorPastel": "Pastels",
  "giftFinderColorBright": "Bright",
  "giftFinderColorMixed": "Mixed",
  "giftFinderStyleRomantic": "Romantic",
  "giftFinderStyleClassic": "Classic",
  "giftFinderStyleBold": "Bold",
  "giftFinderStyleMinimal": "Minimal",
  "giftFinderStylePlayful": "Playful",
  "giftFinderReasonRecipient": "Matches the recipient",
  "giftFinderReasonOccasion": "Fits the occasion",
  "giftFinderReasonColor": "Colors they'd love",
  "giftFinderReasonStyle": "Their style",
  "giftFinderResultsHeading": "Your picks",
  "giftFinderResultsLede": "Hand-picked for your answers.",
  "giftFinderEmptyHeading": "No perfect match yet",
  "giftFinderEmptyLede": "We couldn't match all your answers. Try a different budget, or browse the full collection.",
  "giftFinderShopAll": "Browse all flowers",
  "giftFinderTryAgain": "Try different answers",
  "giftFinderHomeEyebrow": "Need a little help?",
  "giftFinderShopBanner": "Not sure what to pick?",
  "giftFinderShopBannerAction": "Find your match",
  "giftFinderPdpLink": "Not the right one? Try the gift finder",
  "giftRecipientsLabel": "Gift recipients",
  "giftStylesLabel": "Gift styles",
  "giftColorsLabel": "Gift colors"
```

Reuse the existing occasion label keys (`celebration`, `love`, `thankYou`, `newHome`, `congratulations`, `sympathy`) defined in `features/catalog/catalog-labels.ts` for the occasion answers.

- [ ] **Step 5: Add AR keys**

Append the same key set with Arabic values to `features/i18n/locales/ar.json`. Use the natural labels; this file RTL. A faithful set:

```json
  "navGiftFinder": "ابحث عن هديتك",
  "giftFinderTitle": "ابحث عن هديتك",
  "giftFinderLede": "لست متأكداً ماذا ترسل؟ أجب عن خمسة أسئلة سريعة وسنختار لك الأزهار المثالية.",
  "giftFinderIntroHeading": "اعثر على الباقة المثالية",
  "giftFinderIntroLede": "بضع إجابات سريعة وسنرشح لك أزهاراً يحبها — جاهزة لإضافتها إلى حقيبتك في أقل من دقيقة.",
  "giftFinderStart": "ابدأ الاختبار",
  "giftFinderStep": "الخطوة {step} من {total}",
  "giftFinderNext": "التالي",
  "giftFinderBack": "السابق",
  "giftFinderRetake": "ابدأ من جديد",
  "giftFinderAdding": "نختار أزهارك…",
  "giftFinderError": "حدث خطأ أثناء اختيار باقتك. يرجى المحاولة مرة أخرى.",
  "giftFinderQRecipient": "إلى من الهدية؟",
  "giftFinderQOccasion": "ما المناسبة؟",
  "giftFinderQBudget": "ما الميزانية؟",
  "giftFinderQColor": "ما الألوان التي يحبها؟",
  "giftFinderQStyle": "ما أسلوبهم؟",
  "giftFinderRecipientPartner": "الشريك",
  "giftFinderRecipientFamily": "العائلة",
  "giftFinderRecipientFriend": "صديق",
  "giftFinderRecipientColleague": "زميل",
  "giftFinderOccasionJustBecause": "بدون مناسبة",
  "giftFinderBudgetUnder150": "أقل من 150 جنيهاً",
  "giftFinderBudget150-250": "150–250 جنيهاً",
  "giftFinderBudgetOver250": "أكثر من 250 جنيهاً",
  "giftFinderColorRed": "أحمر",
  "giftFinderColorPink": "وردي",
  "giftFinderColorWhite": "أبيض",
  "giftFinderColorPastel": "باستيل",
  "giftFinderColorBright": "مشرق",
  "giftFinderColorMixed": "متنوع",
  "giftFinderStyleRomantic": "رومانسي",
  "giftFinderStyleClassic": "كلاسيكي",
  "giftFinderStyleBold": "جريء",
  "giftFinderStyleMinimal": "بسيط",
  "giftFinderStylePlayful": "مرح",
  "giftFinderReasonRecipient": "يناسب المستلم",
  "giftFinderReasonOccasion": "مناسب للمناسبة",
  "giftFinderReasonColor": "ألوان تناسب الذوق",
  "giftFinderReasonStyle": "أسلوبهم",
  "giftFinderResultsHeading": "اختياراتك",
  "giftFinderResultsLede": "مختارة بعناية وفق إجاباتك.",
  "giftFinderEmptyHeading": "لا يوجد تطابق مثالي بعد",
  "giftFinderEmptyLede": "لم نتمكن من مطابقة كل إجاباتك. جرّب ميزانية مختلفة، أو تصفح المجموعة كاملة.",
  "giftFinderShopAll": "تصفح كل الأزهار",
  "giftFinderTryAgain": "جرّب إجابات أخرى",
  "giftFinderHomeEyebrow": "تحتاج مساعدة بسيطة؟",
  "giftFinderShopBanner": "لست متأكداً ماذا تختار؟",
  "giftFinderShopBannerAction": "اعثر على اختيارك",
  "giftFinderPdpLink": "ليس هذا ما تريده؟ جرّب أداة البحث عن الهدايا",
  "giftRecipientsLabel": "مستلمو الهدايا",
  "giftStylesLabel": "أنماط الهدايا",
  "giftColorsLabel": "ألوان الهدايا"
```

- [ ] **Step 6: Add FR keys**

Append the same set with French values to `features/i18n/locales/fr.json`:

```json
  "navGiftFinder": "Trouver un cadeau",
  "giftFinderTitle": "Trouver un cadeau",
  "giftFinderLede": "Vous ne savez pas quoi envoyer ? Répondez à cinq questions rapides et nous choisirons les fleurs parfaites.",
  "giftFinderIntroHeading": "Trouvez le bouquet parfait",
  "giftFinderIntroLede": "Quelques réponses rapides et nous vous recommandons des fleurs qu'ils adoreront — prêtes à ajouter au panier en moins d'une minute.",
  "giftFinderStart": "Commencer le quiz",
  "giftFinderStep": "Étape {step} sur {total}",
  "giftFinderNext": "Suivant",
  "giftFinderBack": "Retour",
  "giftFinderRetake": "Recommencer",
  "giftFinderAdding": "Choisissons vos fleurs…",
  "giftFinderError": "Une erreur est survenue en choisissant votre bouquet. Veuillez réessayer.",
  "giftFinderQRecipient": "Pour qui ?",
  "giftFinderQOccasion": "Quelle occasion ?",
  "giftFinderQBudget": "Quel budget ?",
  "giftFinderQColor": "Quelles couleurs ?",
  "giftFinderQStyle": "Quel style ?",
  "giftFinderRecipientPartner": "Un partenaire",
  "giftFinderRecipientFamily": "La famille",
  "giftFinderRecipientFriend": "Un(e) ami(e)",
  "giftFinderRecipientColleague": "Un(e) collègue",
  "giftFinderOccasionJustBecause": "Sans occasion",
  "giftFinderBudgetUnder150": "Moins de 150 EGP",
  "giftFinderBudget150-250": "150–250 EGP",
  "giftFinderBudgetOver250": "Plus de 250 EGP",
  "giftFinderColorRed": "Rouge",
  "giftFinderColorPink": "Rose",
  "giftFinderColorWhite": "Blanc",
  "giftFinderColorPastel": "Pastel",
  "giftFinderColorBright": "Éclatant",
  "giftFinderColorMixed": "Assorti",
  "giftFinderStyleRomantic": "Romantique",
  "giftFinderStyleClassic": "Classique",
  "giftFinderStyleBold": "Audacieux",
  "giftFinderStyleMinimal": "Minimaliste",
  "giftFinderStylePlayful": "Enjoué",
  "giftFinderReasonRecipient": "Conforme au destinataire",
  "giftFinderReasonOccasion": "Convient à l'occasion",
  "giftFinderReasonColor": "Couleurs qu'ils adoreront",
  "giftFinderReasonStyle": "Leur style",
  "giftFinderResultsHeading": "Vos choix",
  "giftFinderResultsLede": "Sélectionnés avec soin selon vos réponses.",
  "giftFinderEmptyHeading": "Aucun choix parfait pour l'instant",
  "giftFinderEmptyLede": "Nous ne pouvons pas correspondre à toutes vos réponses. Essayez un autre budget, ou parcourez toute la collection.",
  "giftFinderShopAll": "Voir toutes les fleurs",
  "giftFinderTryAgain": "Essayer d'autres réponses",
  "giftFinderHomeEyebrow": "Besoin d'aide ?",
  "giftFinderShopBanner": "Vous ne savez pas quoi choisir ?",
  "giftFinderShopBannerAction": "Trouvez votre choix",
  "giftFinderPdpLink": "Pas le bon ? Essayez l'outil de recherche de cadeaux",
  "giftRecipientsLabel": "Destinataires du cadeau",
  "giftStylesLabel": "Styles de cadeau",
  "giftColorsLabel": "Couleurs du cadeau"
```

- [ ] **Step 7: Run the session test**

Run: `npx vitest run tests/unit/features/gift-finder/session.test.ts`
Expected: PASS.

- [ ] **Step 8: Verify key parity across locales**

Run (if a parity test/script exists — otherwise manual): `node -e "const l=require('./features/i18n/locales/en.json'); const a=require('./features/i18n/locales/ar.json'); const f=require('./features/i18n/locales/fr.json'); const miss=(x,y)=>Object.keys(x).filter(k=>!(k in y)); console.log('ar missing', miss(l,a)); console.log('fr missing', miss(l,f));"`
Expected: both `ar missing` and `fr missing` print empty arrays for the new keys.

- [ ] **Step 9: Typecheck + commit**

Run: `npx tsc --noEmit`
Expected: no errors. Then:

```bash
git add features/gift-finder/session.ts tests/unit/features/gift-finder/session.test.ts features/i18n/locales/en.json features/i18n/locales/ar.json features/i18n/locales/fr.json
git commit -m "feat(gift-finder): i18n keys and anonymous session id helper"
```

---

### Task 8: Quiz + results client components and route

**Files:**
- Create: `features/gift-finder/GiftFinderQuiz.tsx`
- Create: `features/gift-finder/GiftFinderResults.tsx`
- Create: `app/[locale]/[city]/gift-finder/page.tsx`
- Create: `tests/components/gift-finder-quiz.test.tsx`

**Interfaces:**
- Consumes: `completeGiftFinder` server action (Task 6), `getQuizSessionId` (Task 7), `scoreProducts` outputs (`ScoredProduct`, `GiftFinderOutcome`), `ProductCard`, `useCart().addItem`, `useI18n`/`useStorePath`.
- Produces: the `/gift-finder` route renders the quiz; on completion it renders the results grid and supports add-to-cart.

- [ ] **Step 1: Write the failing component test**

Create `tests/components/gift-finder-quiz.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { GiftFinderQuiz } from '@/features/gift-finder/GiftFinderQuiz';
import { I18nProvider } from '@/features/i18n/I18nProvider';

const mocks = vi.hoisted(() => ({ completeGiftFinder: vi.fn() }));
vi.mock('@/features/gift-finder/actions', () => ({ completeGiftFinder: mocks.completeGiftFinder }));
vi.mock('next/navigation', () => ({ usePathname: () => '/en/cairo/gift-finder', useRouter: () => ({ push: vi.fn() }) }));

describe('GiftFinderQuiz', () => {
  it('walks through the questions and shows results on completion', async () => {
    mocks.completeGiftFinder.mockResolvedValue({ status: 'ok', results: [{ product: { slug: 'red-rose', name: 'Red Rose', description: '', category: 'hand-bouquet', occasions: ['love'], price: 14000, tone: '#c2185b', imageUrl: null, inventory: 5, delivery: 'Next-day', createdAt: '2026-01-01', variants: [], addOns: [] }, reasons: ['recipient'] }] });
    render(<I18nProvider initialLocale="en"><GiftFinderQuiz /></I18nProvider>);
    await screen.findByText(/who's it for/i);
    // The quiz auto-advances on selection, so select one option per step.
    fireEvent.click(screen.getByText('A partner'));
    fireEvent.click(screen.getByText('Celebration')); // EN value of the `celebration` key (the birthday occasion)
    fireEvent.click(screen.getByText('EGP 150–250'));
    fireEvent.click(screen.getByText('Red'));
    fireEvent.click(screen.getByText('Romantic'));
    await waitFor(() => expect(mocks.completeGiftFinder).toHaveBeenCalled());
    expect(await screen.findByText('Red Rose')).toBeInTheDocument();
  });
});
```

(The occasion label for the `birthday` value is the existing key `celebration`, whose EN value is "Celebration"; if that dictionary value ever changes, update the clicked string to match.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/components/gift-finder-quiz.test.tsx`
Expected: FAIL (module `@/features/gift-finder/GiftFinderQuiz` not found).

- [ ] **Step 3: Implement `GiftFinderQuiz.tsx`**

A `'use client'` stepper. State: `step: number`, `answers: QuizAnswers`, and an idle/loading/done view. On the final selection it calls `completeGiftFinder`. It stores answers in local state and renders `GiftFinderResults` on `done`.

```tsx
'use client';

import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/features/i18n/I18nProvider';
import { getQuizSessionId } from './session';
import { completeGiftFinder } from './actions';
import { GiftFinderResults } from './GiftFinderResults';
import type { GiftFinderOutcome, QuizAnswers } from './types';

type QuestionId = 'recipient' | 'occasion' | 'budget' | 'color' | 'style';

const QUESTIONS: Array<{ id: QuestionId; labelKey: string; options: Array<{ value: string; labelKey: string }> }> = [
  {
    id: 'recipient', labelKey: 'giftFinderQRecipient',
    options: [
      { value: 'partner', labelKey: 'giftFinderRecipientPartner' },
      { value: 'family', labelKey: 'giftFinderRecipientFamily' },
      { value: 'friend', labelKey: 'giftFinderRecipientFriend' },
      { value: 'colleague', labelKey: 'giftFinderRecipientColleague' },
    ],
  },
  {
    id: 'occasion', labelKey: 'giftFinderQOccasion',
    options: [
      { value: 'birthday', labelKey: 'celebration' },
      { value: 'love', labelKey: 'love' },
      { value: 'thank-you', labelKey: 'thankYou' },
      { value: 'new-home', labelKey: 'newHome' },
      { value: 'congratulations', labelKey: 'congratulations' },
      { value: 'sympathy', labelKey: 'sympathy' },
      { value: 'just-because', labelKey: 'giftFinderOccasionJustBecause' },
    ],
  },
  {
    id: 'budget', labelKey: 'giftFinderQBudget',
    options: [
      { value: 'under-150', labelKey: 'giftFinderBudgetUnder150' },
      { value: '150-250', labelKey: 'giftFinderBudget150-250' },
      { value: 'over-250', labelKey: 'giftFinderBudgetOver250' },
    ],
  },
  {
    id: 'color', labelKey: 'giftFinderQColor',
    options: [
      { value: 'red', labelKey: 'giftFinderColorRed' },
      { value: 'pink', labelKey: 'giftFinderColorPink' },
      { value: 'white', labelKey: 'giftFinderColorWhite' },
      { value: 'pastel', labelKey: 'giftFinderColorPastel' },
      { value: 'bright', labelKey: 'giftFinderColorBright' },
      { value: 'mixed', labelKey: 'giftFinderColorMixed' },
    ],
  },
  {
    id: 'style', labelKey: 'giftFinderQStyle',
    options: [
      { value: 'romantic', labelKey: 'giftFinderStyleRomantic' },
      { value: 'classic', labelKey: 'giftFinderStyleClassic' },
      { value: 'bold', labelKey: 'giftFinderStyleBold' },
      { value: 'minimal', labelKey: 'giftFinderStyleMinimal' },
      { value: 'playful', labelKey: 'giftFinderStylePlayful' },
    ],
  },
];

function toAnswers(q: QuestionId, value: string, current: QuizAnswers): QuizAnswers {
  return { ...current, [q]: value };
}

export function GiftFinderQuiz() {
  const { t } = useI18n();
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<QuizAnswers>({ recipient: '', occasion: '', budget: '', color: '', style: '' });
  const [phase, setPhase] = useState<'intro' | 'quiz' | 'loading' | 'done' | 'error'>('intro');
  const [outcome, setOutcome] = useState<GiftFinderOutcome | null>(null);

  const total = QUESTIONS.length;

  // Selecting a value auto-advances to the next question; on the final
  // question it fires the completion action instead.
  function choose(value: string) {
    const question = QUESTIONS[step]!;
    const next = toAnswers(question.id, value, answers);
    setAnswers(next);
    if (step + 1 >= total) {
      void run(next);
    } else {
      setStep(step + 1);
    }
  }

  async function run(finalAnswers: QuizAnswers) {
    setPhase('loading');
    try {
      const result = await completeGiftFinder(finalAnswers, getQuizSessionId());
      if (result === 'invalid') { setPhase('error'); return; }
      setOutcome(result);
      setPhase('done');
    } catch {
      setPhase('error');
    }
  }

  if (phase === 'intro') {
    return (
      <div className="mx-auto max-w-2xl py-16 text-center">
        <p className="mb-3 text-xs font-bold uppercase tracking-[0.18em] text-tertiary">{t('giftFinderHomeEyebrow')}</p>
        <h1 className="font-display text-[40px] font-semibold leading-tight text-on-surface">{t('giftFinderIntroHeading')}</h1>
        <p className="mx-auto mt-4 max-w-md text-on-surface-variant">{t('giftFinderIntroLede')}</p>
        <Button className="mt-8 px-8 py-4 text-base" onClick={() => setPhase('quiz')}>{t('giftFinderStart')}</Button>
      </div>
    );
  }

  if (phase === 'loading') {
    return (
      <div className="mx-auto max-w-md py-24 text-center" role="status">
        <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <p className="text-on-surface-variant">{t('giftFinderAdding')}</p>
      </div>
    );
  }

  if (phase === 'error') {
    return (
      <div className="mx-auto max-w-md py-24 text-center">
        <p className="text-on-surface">{t('giftFinderError')}</p>
        <Button className="mt-6" onClick={() => setPhase('quiz')}>{t('giftFinderTryAgain')}</Button>
      </div>
    );
  }

  if (phase === 'done' && outcome) {
    return (
      <GiftFinderResults
        outcome={outcome}
        onRetake={() => {
          setAnswers({ recipient: '', occasion: '', budget: '', color: '', style: '' });
          setStep(0);
          setPhase('quiz');
        }}
      />
    );
  }

  const question = QUESTIONS[step]!;
  return (
    <div className="mx-auto max-w-2xl py-12">
      <p className="mb-2 text-sm text-on-surface-variant" role="status">{t('giftFinderStep', { step: step + 1, total })}</p>
      <AnimatePresence mode="wait">
        <motion.div key={step} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.25 }}>
          <h1 className="mb-6 font-display text-3xl font-semibold text-on-surface">{t(question.labelKey)}</h1>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {question.options.map((opt) => (
              <button key={opt.value} type="button" onClick={() => choose(opt.value)} className="press cursor-pointer rounded-2xl border border-outline-variant/50 bg-surface p-4 text-left text-sm font-medium text-on-surface transition-all hover:border-primary hover:-translate-y-0.5">
                {t(opt.labelKey)}
              </button>
            ))}
          </div>
          <div className="mt-8 flex justify-between">
            <Button type="button" variant="outline" onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0}>{t('giftFinderBack')}</Button>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
```

> Note: `useCart().addItem` is not referenced in `GiftFinderQuiz` directly — results handle add-to-cart; pass a callback or render `GiftFinderResults` with access to the hook.

- [ ] **Step 4: Implement `GiftFinderResults.tsx`**

Create `features/gift-finder/labels.ts` (reason → i18n key; the key resolves to a static localized string, no interpolation):

```ts
import type { QuizReason } from './types';

/** Map a quiz reason to the i18n key for its chip label. */
export function giftFinderReasonKey(reason: QuizReason): string {
  switch (reason) {
    case 'recipient': return 'giftFinderReasonRecipient';
    case 'occasion': return 'giftFinderReasonOccasion';
    case 'color': return 'giftFinderReasonColor';
    case 'style': return 'giftFinderReasonStyle';
  }
}
```

Create `features/gift-finder/GiftFinderResults.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { ProductCard } from '@/features/catalog/ProductCard';
import { useCart } from '@/features/cart/CartProvider';
import { useI18n } from '@/features/i18n/I18nProvider';
import { useStorePath } from '@/features/i18n/use-store-path';
import { Button } from '@/components/ui/button';
import { giftFinderReasonKey } from './labels';
import type { GiftFinderOutcome } from './types';

export function GiftFinderResults({ outcome, onRetake }: { outcome: GiftFinderOutcome; onRetake: () => void }) {
  const { t } = useI18n();
  const { href } = useStorePath();
  const { addItem } = useCart();

  if (outcome.status === 'empty' || (outcome.status === 'ok' && outcome.results.length === 0)) {
    return (
      <div className="mx-auto max-w-md py-24 text-center">
        <h1 className="font-display text-3xl font-semibold text-on-surface">{t('giftFinderEmptyHeading')}</h1>
        <p className="mt-3 text-on-surface-variant">{t('giftFinderEmptyLede')}</p>
        <div className="mt-6 flex justify-center gap-3">
          <Button type="button" variant="outline" onClick={onRetake}>{t('giftFinderTryAgain')}</Button>
          <Button asChild><Link href={href('/shop')}>{t('giftFinderShopAll')}</Link></Button>
        </div>
      </div>
    );
  }

  const results = outcome.status === 'ok' ? outcome.results : [];

  return (
    <div className="mx-auto max-w-5xl py-16">
      <div className="mb-8 text-center">
        <p className="mb-3 text-xs font-bold uppercase tracking-[0.18em] text-tertiary">{t('giftFinderTitle')}</p>
        <h1 className="font-display text-4xl font-semibold text-on-surface">{t('giftFinderResultsHeading')}</h1>
        <p className="mx-auto mt-2 max-w-sm text-on-surface-variant">{t('giftFinderResultsLede')}</p>
      </div>
      <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
        {results.map(({ product, reasons }) => (
          <div key={product.slug} className="flex flex-col gap-3">
            <ProductCard product={product} />
            <ul className="flex flex-wrap gap-2">
              {reasons.map((reason) => <li key={reason} className="rounded-full border border-outline-variant/40 px-3 py-1 text-xs text-on-surface-variant">{t(giftFinderReasonKey(reason))}</li>)}
            </ul>
            <Button onClick={() => addItem({ id: `${product.slug}-gift-finder`, productSlug: product.slug, productName: product.name, productNameAr: product.nameAr, productNameFr: product.nameFr, tone: product.tone, imageUrl: product.imageUrl, unitPrice: product.price, quantity: 1, addOns: [], message: '', deliveryDate: '' })}>
              {t('addToBag')}
            </Button>
          </div>
        ))}
      </div>
      <div className="mt-10 text-center">
        <Button type="button" variant="outline" onClick={onRetake}>{t('giftFinderRetake')}</Button>
      </div>
    </div>
  );
}
```

> The add-to-cart uses `unitPrice: product.price` (minor units, base price with no variant chosen), matching `ProductDetail`'s default. `deliveryDate` is left empty so the cart supplies its default delivery date; there is no delivery date input on the results screen.

- [ ] **Step 5: Implement the route `page.tsx`**

Create `app/[locale]/[city]/gift-finder/page.tsx` (server component; the page only composes the shell and renders the quiz — no catalog data is fetched at render time, the client quiz calls the action):

```tsx
import type { Metadata } from 'next';
import { SiteFooter } from '@/components/layout/SiteFooter';
import { SiteHeader } from '@/components/layout/SiteHeader';
import { buildLocalizedPageMetadata } from '@/features/seo/page-metadata';
import { getServerT } from '@/features/i18n/server';
import { getOptionalServerEnv } from '@/lib/server-env';
import { LOCALES } from '@/lib/locale-routing';
import { GiftFinderQuiz } from '@/features/gift-finder/GiftFinderQuiz';
import type { Locale } from '@/features/i18n/types';

type PageParams = { params: Promise<{ locale: string; city: string }> };

export async function generateMetadata({ params }: PageParams): Promise<Metadata> {
  const { locale, city } = await params;
  const resolvedLocale: Locale = (LOCALES as string[]).includes(locale) ? (locale as Locale) : 'en';
  const { t } = await getServerT(resolvedLocale);
  const base = (getOptionalServerEnv('SITE_URL') ?? 'http://localhost:3000').replace(/\/$/, '');
  return buildLocalizedPageMetadata({ locale: resolvedLocale, city, path: '/gift-finder', base, title: t('giftFinderTitle'), description: t('giftFinderLede') });
}

export default async function GiftFinderPage({ params }: PageParams) {
  const { locale, city } = await params;
  const resolvedLocale: Locale = (LOCALES as string[]).includes(locale) ? (locale as Locale) : 'en';
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-grow"><GiftFinderQuiz /></main>
      <SiteFooter locale={resolvedLocale} city={city} />
    </div>
  );
}
```

> `getServerT` is only called inside `generateMetadata` (the default export has no server-rendered copy to translate, so it does not call it).

- [ ] **Step 6: Run the component test and a typecheck**

Run: `npx vitest run tests/components/gift-finder-quiz.test.tsx`, then `npx tsc --noEmit`
Expected: component test PASS (verify the occasion label text matches the EN dictionary value for the `celebration` key, adjusting the clicked string if needed). No type errors.

- [ ] **Step 7: Typecheck + commit**

Run: `npx tsc --noEmit`
Expected: no errors. Then:

```bash
git add features/gift-finder/GiftFinderQuiz.tsx features/gift-finder/GiftFinderResults.tsx features/gift-finder/labels.ts "app/[locale]/[city]/gift-finder/page.tsx" tests/components/gift-finder-quiz.test.tsx features/i18n/locales/en.json features/i18n/locales/ar.json features/i18n/locales/fr.json
git commit -m "feat(gift-finder): quiz, results grid, and route"
```

---

### Task 9: Entry points

**Files:**
- Modify: `components/layout/SiteHeader.tsx`
- Modify: `app/[locale]/[city]/(home)/page.tsx`
- Modify: `features/catalog/CatalogToolbar.tsx`
- Modify: `features/product/ProductDetail.tsx`

**Interfaces:**
- Consumes: the `gift-finder` route (Task 8), i18n keys (Task 7), `useStorePath().href` for store links.

- [ ] **Step 1: Header nav link**

In `components/layout/SiteHeader.tsx`, add a nav item to both the desktop and mobile `navItems` arrays (line 34–39):

```ts
  const navItems = [
    { label: t('navGiftFinder'), path: '/gift-finder' },
    { label: t('navCollections'), path: '/shop' },
    { label: t('navBespoke'), path: '/shop?category=vase-arrangement' },
    { label: t('navAtelier'), path: '/blog' },
    { label: t('navGifts'), path: '/gift-cards' },
  ];
```

(The array is shared by the desktop `<nav>` and the mobile `Sheet` — one edit covers both.)

- [ ] **Step 2: Homepage section**

In `app/[locale]/[city]/(home)/page.tsx`, add a promo card section between the "Featured gestures" `<section>` and the "Editorial split" `<section>` (after line 106). It is a server component, so build the link with `/${locale}/${cityCode}/gift-finder`:

```tsx
        {/* Gift finder prompt */}
        <section className="mx-auto max-w-[1280px] px-5 md:px-[64px] py-20">
          <div className="ambient-glow flex flex-col items-center gap-5 rounded-[1.25rem] border border-outline-variant/30 bg-surface-container-low px-8 py-14 text-center md:px-20">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-tertiary">{t('giftFinderHomeEyebrow')}</p>
            <h2 className="max-w-xl font-display text-[32px] leading-tight tracking-[-0.015em] text-on-surface">{t('giftFinderTitle')}</h2>
            <p className="max-w-lg text-on-surface-variant">{t('giftFinderLede')}</p>
            <Link href={`/${locale}/${cityCode}/gift-finder`} className="lift press mt-2 inline-flex items-center gap-2 rounded-full bg-primary px-8 py-3 text-sm font-semibold text-on-primary transition-colors hover:bg-on-primary-fixed-variant">
              {t('giftFinderStart')} <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>
```

(`ArrowRight` is already imported in that file.)

- [ ] **Step 3: Shop toolbar banner**

In `features/catalog/CatalogToolbar.tsx`, append a full-width banner below the filter row, inside the returned `<section>` (after the closing `</div>` of the filter flex at line 60, but still before the `</section>` at line 62). Add the import for `Link` and `useStorePath` at the top of the file:

```tsx
import Link from 'next/link';
import { useStorePath } from '@/features/i18n/use-store-path';
```

and inside the component,

```tsx
  const { href } = useStorePath();
```

then between the main toolbar `</div>` and `</section>`:

```tsx
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-outline-variant/30 bg-surface-container px-5 py-4">
          <p className="text-sm font-medium text-on-surface">{t('giftFinderShopBanner')}</p>
          <Link href={href('/gift-finder')} className="text-sm font-semibold text-primary underline underline-offset-4 hover:text-on-primary-fixed-variant">{t('giftFinderShopBannerAction')} ↗</Link>
        </div>
```

- [ ] **Step 4: Product detail link**

In `features/product/ProductDetail.tsx`, add a subtle text link below the description (after line 76) inside the `flex flex-col gap-2` block, linking to `href('/gift-finder')` (it already imports `Link` and `useStorePath`):

```tsx
          <Link href={href('/gift-finder')} className="mt-1 text-sm text-primary underline underline-offset-4 hover:text-on-primary-fixed-variant">{t('giftFinderPdpLink')} ↗</Link>
```

- [ ] **Step 5: Typecheck + full test run**

Run: `npx tsc --noEmit`, then `npm test`
Expected: no type errors; the full Vitest suite passes (including the new component/domain tests).

- [ ] **Step 6: Commit**

```bash
git add components/layout/SiteHeader.tsx "app/[locale]/[city]/(home)/page.tsx" features/catalog/CatalogToolbar.tsx features/product/ProductDetail.tsx
git commit -m "feat(gift-finder): entry points across nav, home, shop, and product detail"
```

---

### Task 10: E2E spec + final verification

**Files:**
- Create: `tests/e2e/gift-finder.spec.ts`
- Verify: full suite + typecheck + lint

**Interfaces:**
- Consumes: the complete feature (Tasks 1–9), the existing Playwright config and `base-url` conventions in `tests/e2e/`.

- [ ] **Step 1: Write the E2E spec**

Following the exact style of `tests/e2e/motion-foundation.spec.ts` (Vitest `describe/it` with raw Playwright `chromium`/`Page`), create `tests/e2e/gift-finder.spec.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser, type Page } from "playwright";
import { getBaseUrl } from "./base-url";

let browser: Browser;
let page: Page;

beforeAll(async () => {
  browser = await chromium.launch();
  const context = await browser.newContext();
  page = await context.newPage();
}, 60_000);

afterAll(async () => {
  await browser?.close();
});

describe("Gift finder quiz", () => {
  it("completes and renders results", async () => {
    await page.goto(`${getBaseUrl()}/en/cairo/gift-finder`, { waitUntil: "domcontentloaded" });
    await page.getByText(/who's it for/i).waitFor({ state: "visible", timeout: 10_000 });

    const pick = async (label: string) => {
      await page.getByRole("button", { name: label, exact: true }).click();
    };

    await pick("A partner");
    await pick("Celebration"); // EN value of the `celebration` key (the birthday occasion)
    await pick("EGP 150–250");
    await pick("Red");
    await pick("Romantic");

    await page.getByText(/your picks/i).waitFor({ state: "visible", timeout: 15_000 });
    expect(await page.getByText(/add to bag/i).count()).toBeGreaterThan(0);
  });
});
```

> The occasion label text (`Celebration`) is the EN value of the `celebration` key. The budget selectors ("EGP 150–250") must match the EN dictionary values for `giftFinderBudget…`. If any value differs, use the exact dictionary string, not the reverse.

- [ ] **Step 2: Run the E2E spec**

The `test:e2e` script pins a single file (`npm run test:e2e` runs only `tests/e2e/rosette.playwright.test.ts`), so run the new spec directly:

Run: `npx vitest run --config vitest.e2e.config.ts tests/e2e/gift-finder.spec.ts`
Expected: the gift finder spec passes end-to-end. Fix any selector mismatch against the rendered strings, then confirm the whole existing suite still passes with `npm run test:e2e`.

- [ ] **Step 3: Final typecheck, unit tests, lint**

Run: `npx tsc --noEmit`, `npm test`, and the repo's lint script (inspect `package.json`).
Expected: all pass.

- [ ] **Step 4: Update the plan’s migration/spec references if any mismatch**

Confirm the migration file is the highest-numbered one (`033`) and that `docs/superpowers/specs/2026-08-27-gift-finder-design.md` remains consistent with the implemented budget bands and reason labels. No further commit is required if already consistent.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/gift-finder.spec.ts
git commit -m "test(gift-finder): end-to-end quiz flow"
```

---

## Self-Review Notes

- **Spec coverage:** every spec section maps to a task: data model (Task 1, 3, 4), quiz content/scoring (Task 2, 5), architecture/route/action (Task 6, 8), entry points (Task 9), error handling (Task 6 `invalid`/best-effort, Task 8 `error` phase, Task 8 empty state), testing (Tasks 5, 6, 8, 10), i18n (Task 7).
- **Dependency order:** each task consumes exactly what prior tasks produced. Task 8 (quiz + results) depends on the `completeGiftFinder` action (Task 6) and the session helper (Task 7). Task 4 (admin) depends on the canonical tag lists (Task 2); Tasks 3/4 expose the tag fields consumed by scoring (Task 5).
- **Executed string checks** (already resolved, do not re-verify): the EN value of the `celebration` key is "Celebration"; `SignIn`-free e2e specs are Vitest-style (`describe`/`it` + raw Playwright, importing from `vitest` and `playwright`); the `test:e2e` script pins `rosette.playwright.test.ts`, so the new spec is run directly with `vitest run --config vitest.e2e.config.ts tests/e2e/gift-finder.spec.ts`.
- **Migration numbering:** confirmed `033` is the next free number after `032`.