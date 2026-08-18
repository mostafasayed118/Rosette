# Blog & SEO content engine

## Goal

Add a content engine for SEO landing pages (blog posts + per-city pages like
"flower delivery in cairo"), stored in Supabase with admin CRUD and rendered
on the localized storefront with full metadata/JSON-LD.

## Data model (new migration `supabase/migrations/006_blog.sql`)

```sql
create table public.blog_posts (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  type text not null default 'post' check (type in ('post', 'city')),
  city_code text,
  title_en text not null,
  title_ar text,
  title_fr text,
  excerpt_en text,
  excerpt_ar text,
  excerpt_fr text,
  content_en text not null,
  content_ar text,
  content_fr text,
  category text,
  published boolean not null default false,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (slug, type)
);
```

- `type='post'` → regular blog article; `type='city'` → per-city landing page
  (`city_code` set, rendered at `/[locale]/[city]/delivery`).
- RLS: public SELECT only for `published = true` rows (mirrors how products
  are exposed); admin writes go through the service-role client.
- Content is simple HTML (admin-authored only; no markdown dependency). A
  `prose`-style wrapper in the UI keeps typography consistent.

## Content sources

- `features/blog/` — `types.ts` (`BlogPost`, `BlogPostInput`),
  `blog-repository.ts` (list published, get by slug, admin list/create/update/
  delete), `supabase-repository.ts`, `local-repository.ts` (fallback seeded
  posts so the storefront works without Supabase), `provider.ts` (selects via
  the existing `selectDataSource` pattern), `data.ts` (local seed posts).
- Supabase seed: add 3 sample posts + 2 city pages (cairo, alexandria) to
  `supabase/seed.sql` (idempotent, fixed ids).

## Storefront routes

- `app/[locale]/[city]/blog/page.tsx` — list of published `type='post'` rows
  (localized title/excerpt), newest first.
- `app/[locale]/[city]/blog/[slug]/page.tsx` — article detail: localized
  title/excerpt/content, published date, category; `BlogPosting` JSON-LD;
  `generateMetadata` with canonical + hreflang (reuse the existing
  `buildLocalizedPageMetadata`).
- `app/[locale]/[city]/delivery/page.tsx` — per-city SEO landing page. Looks
  up the `type='city'` row for `city_code`; when absent, renders a generated
  localized default (boilerplate same-day-delivery copy mentioning the city),
  so every city has a crawlable landing page. Metadata + `Service`/`FAQPage`-
  style JSON-LD kept minimal (BlogPosting/Article not required here).
- Links: blog entries link to the article; header/footer optional blog link
  (footer only, to avoid nav clutter).

## Admin CRUD

- `app/admin/blog/page.tsx` — table of all posts (title, type, published,
  updated) + new/edit links.
- `app/admin/blog/new/page.tsx` + `app/admin/blog/[id]/page.tsx` — editor
  form: slug, type, city (when type=city), localized title/excerpt/content
  (en required, ar/fr optional), category, published toggle.
- `app/api/admin/blog/route.ts` (GET list, POST create) +
  `app/api/admin/blog/[id]/route.ts` (PUT update, DELETE).
- Sidebar: add "Blog" nav entry (`FileText` icon) to `AdminShell`/`AppSidebar`.

## SEO surface

- Blog list + article metadata via `generateMetadata` (localized title/
  description, canonical, en/ar/fr hreflang) reusing `buildLocalizedPageMetadata`.
- `BlogPosting` JSON-LD on article pages (headline, datePublished, image).
- `app/sitemap.ts`: add blog list, each published article
  (`/blog/[slug]` per locale), and each city's `/delivery` page.
- i18n keys (EN/AR/FR): `blog`, `readMore`, `noPostsYet`, `publishedOn`,
  `delivery` etc.

## Out of scope

- Comments, categories-as-taxonomy pages, authors, tags.
- RSS feed, image uploads (use the existing Supabase storage pattern later).
- Slug collision handling beyond the unique constraint.

## Testing

- Repository: list-published filtering (published only, type filter, city
  filter), get-by-slug, admin CRUD against a fake client.
- Content rendering: city default page generator (pure function) — every city
  yields a landing page; localized output.
- SEO: `BlogPosting` JSON-LD shape; sitemap includes blog + delivery pages.
- Existing suite stays green.

## Phases

- **A** schema + repository + seed (foundation, test-first)
- **B** storefront blog + per-city pages + i18n + SEO
- **C** admin CRUD + API + nav
- **D** full gate + merge
