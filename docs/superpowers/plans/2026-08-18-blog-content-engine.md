# Plan — Blog & SEO content engine

Spec: `docs/superpowers/specs/2026-08-18-blog-content-engine.md`

Four phases, executed test-first in an isolated worktree. Each phase ends
green (tests + `tsc` + build) before the next.

---

## Phase A — content foundation

### A1. Schema + seed

- `supabase/migrations/006_blog.sql`: `blog_posts` table per the spec
  (`unique (slug, type)`, published flag, RLS select policy for published
  rows).
- `supabase/seed.sql`: idempotent inserts for 3 `post` rows + 2 `city` rows
  (cairo, alexandria) with localized title/excerpt/content (EN/AR).

### A2. Repository

- `features/blog/types.ts` — `BlogPost`, `BlogPostInput`, `BlogPostSummary`,
  `BlogRepository` interface:
  - `listPublished({ type, cityCode })` → summaries, newest first,
  - `getBySlug(slug)` → post or null (published only),
  - admin: `listAll()`, `create(input)`, `update(id, input)`, `delete(id)`.
- `features/blog/data.ts` + `local-repository.ts` — fallback seeded posts
  (local mode).
- `features/blog/supabase-repository.ts` — SQL-backed implementation.
- `features/blog/provider.ts` — `getBlogRepository()` via `selectDataSource`.

### A3. Repository tests (TDD)

- `tests/domain/blog-repository.test.ts` (fake client): list filters
  (published-only, type=post/city, cityCode), get-by-slug published, admin
  CRUD (create/update/delete calls + payloads).

---

## Phase B — storefront + SEO

### B1. Blog routes

- `app/[locale]/[city]/blog/page.tsx` — list published posts (localized
  title/excerpt via `pickLocalized`), links to articles.
- `app/[locale]/[city]/blog/[slug]/page.tsx` — detail: localized title/
  excerpt/content (HTML), category, date; 404 via `notFound()` when missing.

### B2. Per-city landing pages

- `features/blog/city-landing.ts` — pure `buildCityLandingPage({ city, locale,
  t })` returning `{ title, excerpt, content }` (custom row when present,
  generated localized default otherwise).
- `app/[locale]/[city]/delivery/page.tsx` — looks up the `type='city'` row
  for the current city (via slug→code), falls back to the generator, renders
  content.
- Tests: `tests/domain/city-landing.test.ts` — every city yields a landing
  page; localized default mentions the city name.

### B3. SEO

- `features/seo/blog-jsonld.ts` — pure `buildBlogPostingJsonLd(post, locale)`
  (headline, datePublished, image when present) + component
  `components/seo/BlogPostingJsonLd.tsx`.
- `generateMetadata` on blog list + article + delivery pages (reuse
  `buildLocalizedPageMetadata`).
- `app/sitemap.ts`: add `/blog`, `/blog/[slug]` per published post, and
  `/delivery` per city.
- Tests: `tests/domain/blog-jsonld.test.ts`.

### B4. i18n + nav

- i18n keys (EN/AR/FR): `blog`, `readMore`, `noPostsYet`, `publishedOn`,
  `deliveryPageTitle`, `deliveryPageLede`, etc.
- `SiteFooter`: optional blog link.

---

## Phase C — admin CRUD

### C1. API

- `app/api/admin/blog/route.ts` — GET list (all posts), POST create
  (validated input, service-role client).
- `app/api/admin/blog/[id]/route.ts` — PUT update, DELETE.

### C2. Pages + form

- `app/admin/blog/page.tsx` — table (title, type, published, updated) +
  new/edit links + empty state.
- `app/admin/blog/new/page.tsx` + `app/admin/blog/[id]/page.tsx` — editor
  form (`components/admin/BlogPostForm.tsx`, client): slug, type, city select
  (when type=city), localized title/excerpt/content, category, published
  toggle; POST/PUT then `router.push('/admin/blog')`.

### C3. Nav

- `AdminShell` `NAV_ITEMS` + `AppSidebar` `ICONS`: add `/admin/blog`
  (`FileText`).
- Admin i18n keys (`blog`, `newPost`, `editPost`, etc.) EN/AR/FR.

---

## Phase D — gate + merge

- Full suite, `tsc --noEmit`, production build, `git diff --check`, secret
  scan; discard `next-env.d.ts` churn.
- Merge feature branch to `master`, push, clean worktree.
