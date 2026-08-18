# Spec: Author profiles & reading time for blog posts

**Date:** 2026-08-18 · **Status:** Draft for review

## Goal

Give blog articles a human byline and an estimated reading time:

1. **Author profiles** — a reusable `authors` table (localized name, role, bio, avatar) referenced by `blog_posts.author_id`, managed from the admin, displayed on the article page (and optionally list cards).
2. **Reading time** — computed from the article content **in the viewing locale** (Arabic word count differs from English), shown on the article page and list cards.

## Decisions (locked with the user)

- **Separate `authors` table** with its own admin CRUD (`/admin/authors`), referenced by `blog_posts.author_id` (FK, `ON DELETE SET NULL`).
- **Per-locale reading time** — estimate from the localized content the reader is actually viewing.

## Data model

### New table `authors` (migration `007_blog_authors.sql`)

```sql
create table if not exists public.authors (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,             -- url-ish handle
  name_en text not null,
  name_ar text,
  name_fr text,
  role_en text,                          -- "Founder & head florist"
  role_ar text,
  role_fr text,
  bio_en text,
  bio_ar text,
  bio_fr text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.authors enable row level security;
create policy "public can read authors" on public.authors
  for select using (true);              -- public read; admin writes via service role

alter table public.blog_posts
  add column if not exists author_id uuid references public.authors(id) on delete set null;
create index if not exists blog_posts_author_idx on public.blog_posts (author_id);
```

- **Seed:** 2 authors (e.g. a founder + a studio), assigned to the existing seeded posts.
- **Local data:** `features/blog/data.ts` gains `localAuthors`; seeded posts gain `authorId`.

## Reading time (pure, tested)

`features/blog/reading-time.ts`:

```ts
export function estimateReadingTime(html: string, wpm = 200): number {
  const text = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  if (!text) return 1;
  return Math.max(1, Math.ceil(text.split(' ').length / wpm));
}
```

- Strips HTML tags, counts whitespace-separated words, 200 wpm, min 1 min, rounds up.
- The article page computes it from the **localized** content it renders; list cards compute it from the excerpt or a fixed short value (excerpt-based keeps cards cheap and consistent).

## Types & repositories

- `BlogPost` / `BlogPostSummary` gain `authorId: string | null`.
- New `Author` type: `id, slug, nameEn, nameAr?, nameFr?, roleEn?, roleAr?, roleFr?, bioEn?, bioAr?, bioFr?, avatarUrl?`.
- `BlogRepository` gains `listAuthors(): Promise<Author[]>` and `getAuthor(id): Promise<Author | null>` (local + supabase impls; supabase embeds `authors(...)` in post queries via select string).
- `features/admin/blog-admin.ts` gains `listAuthors`, `createAuthor`, `updateAuthor`, `deleteAuthor` (same client-passed pattern as blog CRUD).

## Storefront

- **Article page** (`/blog/[slug]`): author byline block under the title — avatar (rounded, `w-12 h-12`), name (strong), role (muted), bio (small); reading time chip `· {n} min read` in the category eyebrow line, computed from localized content. Missing author → no byline (graceful).
- **Blog list** (`/blog`): show `· {n} min read` on each card (excerpt-based estimate).

## Admin

- **`/admin/authors`** — list (name, slug, role, posts count optional → skip; keep name/slug/role), delete button.
- **`/admin/authors/new` + `/admin/authors/[id]`** — editor form: slug, localized name/role/bio, avatar URL, published-style implicit (no publish flag — authors are always public once created).
- **`POST /api/admin/authors`** (create/update) + **`DELETE /api/admin/authors/[id]`** — admin-only, same pattern as blog routes.
- **BlogForm** — author `<Select>` populated server-side (editor page fetches authors, passes `authors: {id, nameEn}[]`).
- **Sidebar** — new "Authors" entry (`/admin/authors`).

## i18n keys (EN / AR / FR)

- `minRead` — `{count} min read` / `قراءة {count} دقيقة` / `{count} min de lecture`
- `authors` — `Authors` / `المؤلفون` / `Auteurs`
- `authorOperations` — `Author operations` / `عمليات المؤلفين` / `Opérations auteurs`
- `newAuthor` / `editAuthor` / `backToAuthors` — CRUD labels
- `authorRole` / `authorBio` / `authorAvatarUrl` — form labels
- `couldNotSaveAuthor` / `couldNotDeleteAuthor` / `deleteAuthor`

## Out of scope

- Author detail pages (`/blog/authors/[slug]`) — defer until a real editorial voice exists.
- Gravatar/hosted avatar uploads — plain URL field.
- Reading time on the delivery landing pages (they're generated).

## Phases

- **A:** migration `007_blog_authors.sql` + seed + local data + types + `estimateReadingTime` (TDD)
- **B:** repositories (local/supabase, `listAuthors`/`getAuthor` + authorId embed) (TDD)
- **C:** storefront (byline + reading time on article + list)
- **D:** admin (authors CRUD routes/pages, BlogForm author select, sidebar, i18n)
- **E:** full gate (test/tsc/build) + merge + push
