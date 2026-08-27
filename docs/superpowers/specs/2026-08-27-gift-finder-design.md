# Gift finder quiz — design

Date: 2026-08-27
Status: approved for planning

## Problem

Shoppers who don't know flowers often don't know where to start. The catalog
answers "what do you want?" but a large share of florist traffic is asking
"what should I get them?" Today those shoppers scroll the whole catalog or
leave. A short guided quiz — recipient, occasion, budget, colors, style —
converts that uncertainty into a curated shortlist and a fast path to cart.

The product schema currently supports occasion (`occasions text[]`), category
and price matching, but has no recipient, style or color-family data
(`supabase/migrations/001_commerce.sql:19`), so this feature also introduces
structured gift tags on products that future filters and personalization can
reuse.

## Scope

In scope for v1:

- Structured gift tags on products (recipients, styles, color families)
- A 5-question quiz at `/[locale]/[city]/gift-finder`
- Server-side scoring over the existing catalog repository, returning a
  curated top-6 results grid with "why it fits" reasons and quick add-to-cart
- Storage of quiz completions (answers + recommended slugs) for insight
- Admin product form fields for managing gift tags
- Entry points: header nav, homepage section, shop toolbar banner, product
  detail link
- Full EN/AR/FR localization and RTL support

Explicitly deferred:

- **Admin quiz builder.** Questions, answers and weights live in i18n
  dictionaries and code. Admin-editable quiz content roughly doubles scope
  for a fixed 5-question flow; completion data will tell us whether it's
  needed.
- **Personalization integration.** Feeding quiz signals into the
  "Recommended for you" strip (`features/personalization/`) is a natural v2
  once `quiz_completions` has volume.
- **Quiz-abandonment retargeting.** Storing partial progress and emailing
  "finish your gift finder" requires step-level persistence; v1 stores only
  completions.
- **Per-answer merchandising overrides** (hand-picking which products appear
  for specific answer combinations).

## Data model

New migration `supabase/migrations/033_gift_finder.sql`, following the RLS
conventions in `018_occasion_reminders.sql`.

### Product gift tags

Three `text[]` columns on `public.products`, mirroring the existing
`occasions text[]` pattern, each GIN-indexed like `030_supporting_indexes.sql`:

| Column | Type | Notes |
| --- | --- | --- |
| `gift_recipients` | text[] not null default '{}' | canonical recipient tags |
| `gift_styles` | text[] not null default '{}' | canonical style tags |
| `gift_colors` | text[] not null default '{}' | canonical color-family tags |

Canonical values (single source of truth in `features/gift-finder/tags.ts`):

- **recipients:** `partner`, `family`, `friend`, `colleague`
- **styles:** `romantic`, `classic`, `bold`, `minimal`, `playful`
- **colors:** `red`, `pink`, `white`, `pastel`, `bright`, `mixed`

The migration includes idempotent `UPDATE public.products SET ... WHERE slug =`
statements tagging every product in the current seed catalog, so matching
works immediately in both seeded and production databases. Products added
later are tagged through the admin form; untagged products still match on
occasion and price (see Scoring).

### `quiz_completions`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid pk | |
| `session_id` | text not null | anonymous id: `crypto.randomUUID()` persisted in localStorage |
| `profile_id` | uuid | → `profiles(id)`, null for guests |
| `recipient` | text not null | answer tag |
| `occasion` | text not null | answer tag, `just-because` allowed |
| `budget` | text not null | budget band id |
| `color` | text not null | answer tag |
| `style` | text not null | answer tag |
| `locale` | text not null | `en` / `ar` / `fr` |
| `result_slugs` | text[] not null default '{}' | slugs recommended, for funnel analysis |
| `created_at` | timestamptz not null default now() | |

RLS: insert allowed for anon and authenticated roles; no update or delete for
clients; select for admins via service role (consistent with existing tables —
all admin reads go through `getAdminSupabase()`).

## Quiz content

Five single-choice questions. All copy lives in
`features/i18n/locales/{en,ar,fr}.json`; question and answer ids are stable
code constants.

| # | Question | Answer options | Maps to |
| --- | --- | --- | --- |
| 1 | Who's it for? | partner / family / friend / colleague | `gift_recipients` |
| 2 | What's the occasion? | birthday / love / thank-you / new-home / congratulations / sympathy / just-because | existing `occasions[]` |
| 3 | What's your budget? | under 500 / 500–1000 / 1000–2000 / 2000+ EGP | `price_minor` bands |
| 4 | Colors they'd love? | red / pink / white / pastel / bright / mixed | `gift_colors` |
| 5 | Their style? | romantic / classic / bold / minimal / playful | `gift_styles` |

The occasion list reuses the six canonical occasions already seeded
(`features/catalog/data.ts`); `just-because` is quiz-only and skips occasion
matching entirely. Budget bands are defined in `features/gift-finder/tags.ts`
as `{ id, minMinor, maxMinor }` (open-ended at both extremes).

## Scoring

Pure function `scoreProducts(products, answers)` in
`features/gift-finder/scoring.ts` — no I/O, fully unit-testable.

1. **Hard filters:** product active, in stock (`inventory > 0`), base price
   within the selected band.
2. **Weighted score** per product:
   - recipient tag match: +3
   - occasion match: +3 (skipped when answer is `just-because`)
   - color tag match: +2
   - style tag match: +2
3. **Rank:** score descending, tie-break by rating average descending, then
   newest `createdAt`.
4. **Return:** top 6 products with per-product match reasons (which answers
   it satisfied) for the "why it fits" chips.

**Fallback ladder** when fewer than 3 products qualify, applied in order
until ≥ 3 or exhausted:

1. drop the style requirement (remove from scoring, keep hard filters)
2. drop the color requirement
3. widen the budget band by one step in each direction that exists (the
   lowest band widens upward only, the highest downward only)
4. give up → empty-results state (see Error handling)

Untagged products score 0 on the corresponding dimension, so they can still
surface via occasion + price. This keeps the quiz useful before admins finish
tagging the catalog.

## Architecture

Execution model: client-side quiz state machine + one server action on
completion (approach A — scoring stays server-side, testable, and reuses the
catalog repository; one round trip).

### Route

`app/[locale]/[city]/gift-finder/page.tsx` — async server component shell:
`generateMetadata` via `buildLocalizedPageMetadata`, JSON-LD via existing SEO
components, `SiteHeader`/`SiteFooter`, renders the client quiz.

### Feature module `features/gift-finder/`

| File | Role |
| --- | --- |
| `types.ts` | `QuizAnswers`, gift tag and budget band types |
| `tags.ts` | canonical tag lists + budget bands (single source of truth) |
| `scoring.ts` | pure `scoreProducts()` + fallback ladder |
| `actions.ts` | `completeGiftFinder(answers)` server action |
| `GiftFinderQuiz.tsx` | client component: step state machine, progress bar, answer cards, motion transitions |
| `GiftFinderResults.tsx` | results grid: reuses `ProductCard`, match-reason chips, quick add-to-cart, retake link |

### Data flow

1. Shopper answers questions; state lives in `GiftFinderQuiz.tsx`.
2. Last answer invokes `completeGiftFinder(answers)`.
3. Action validates with zod, fetches active products via
   `getCatalogRepository().list()` (same path as the shop page), runs
   `scoreProducts`, inserts a `quiz_completions` row, returns top-6
   `Product[]` + match reasons.
4. `GiftFinderResults.tsx` renders the grid; add-to-cart reuses
   `useCart().addItem` exactly as `features/product/ProductDetail.tsx` does.

Answers remain in client state after completion for retake and retry.

### Motion

Step transitions and results reveal use `motion/react` through the existing
`MotionProvider` primitives (`components/motion/`), honoring the persisted
reduce-motion preference.

### Admin

`app/admin/products/` form gains three multi-selects (recipients, styles,
colors). `saveProduct` in `features/admin/catalog-actions.ts` and
`features/admin/catalog-validation.ts` are extended to validate against the
canonical lists and persist the arrays.

## Entry points

All four are localized links to `/[locale]/[city]/gift-finder`:

1. **Header nav** — "Gift Finder" link in `SiteHeader`.
2. **Homepage** — editorial card section in `app/[locale]/[city]/(home)/page.tsx`.
3. **Shop toolbar** — "Not sure what to pick?" banner in
   `features/catalog/CatalogToolbar.tsx`.
4. **Product detail** — text link in `features/product/ProductDetail.tsx`
   ("Not the right one? Try the gift finder").

## Error handling

- **Validation failure** (malformed/tampered answers): action returns a typed
  error; quiz shows a friendly localized message, keeps answers, allows retry.
- **Completion insert failure:** best-effort — results still render if scoring
  succeeded; the insert failure is logged to Sentry and never blocks the
  shopper.
- **Zero matches after the full fallback ladder:** dedicated empty state with
  CTAs to shop all and to the chatbot.
- **Action/network failure mid-quiz:** answers persist in client state; retry
  button on the final step.

## Testing

Following existing conventions (`tests/domain/`, `tests/unit/`, `tests/e2e/`):

- `tests/domain/gift-finder-scoring.test.ts` — weights, hard filters, budget
  bands, fallback ladder order, `just-because` occasion skip, untagged-product
  degradation, tie-breaks.
- `tests/domain/gift-finder-actions.test.ts` — zod validation, completion row
  shape, best-effort insert behavior.
- Component tests (vitest + jsdom) — step progression, back navigation,
  results render, retake, empty state.
- `tests/e2e/gift-finder.spec.ts` — complete the quiz end-to-end, results
  visible, add-to-cart from results.
- i18n key parity across `en.json` / `ar.json` / `fr.json`.

## Rollout notes

- Migration 033 tags the current seed catalog inline; production coverage for
  products added after the migration is completed by admins through the new
  form fields. Scoring degrades gracefully until then.
- No middleware is introduced (Cloudflare constraint); locale handling reuses
  the existing `[locale]` segment routing.
