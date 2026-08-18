# Plan: Author profiles & reading time

**Spec:** `docs/superpowers/specs/2026-08-18-blog-authors-reading-time.md`

## Execution

Isolated worktree (`blog-authors`) + TDD per task, same flow as the blog content engine. Then full gate (test/tsc/build), merge to `master`, push.

## Tasks

### A — Data layer
- **A1 (TDD)** `features/blog/reading-time.ts` + `tests/domain/reading-time.test.ts`:
  - strips tags, counts words, 200 wpm, rounds up, min 1, empty → 1.
- **A2** `supabase/migrations/007_blog_authors.sql` (authors table + RLS + `blog_posts.author_id` FK + index).
- **A3** seed: 2 authors + assign `author_id` to existing seed posts (uuid literals); `features/blog/data.ts` gains `localAuthors` + `authorId` on posts.
- **A4** `features/blog/types.ts`: `Author` type; `authorId: string | null` on `BlogPost`/`BlogPostSummary`/`BlogPostInput`.

### B — Repositories (TDD)
- **B1** `features/blog/local-repository.ts`: `listAuthors()`, `getAuthor(id)`.
- **B2** `features/blog/supabase-repository.ts`: same + embed `authors(...)` in the post selects and map `author_id`.
- **B3** `tests/domain/blog-repository.test.ts`: new cases (local author lookup; supabase author embed in list/getBySlug; summary carries authorId).
- **B4** `features/admin/blog-admin.ts`: `listAuthors`, `createAuthor`, `updateAuthor`, `deleteAuthor` (+ tests in blog-repository.test.ts admin block).

### C — Storefront
- **C1** `components/blog/AuthorByline.tsx` — avatar/name/role/bio block; renders nothing when author is null.
- **C2** Article page: fetch author via `getAuthor`, render `<AuthorByline>`, compute reading time from localized content, add `· {n} min read` chip.
- **C3** Blog list cards: excerpt-based `estimateReadingTime` chip.
- **C4** i18n keys EN/AR/FR (`minRead`, etc. — storefront subset).

### D — Admin
- **D1** `app/api/admin/authors/route.ts` (POST create/update) + `app/api/admin/authors/[id]/route.ts` (DELETE).
- **D2** `components/admin/AuthorForm.tsx` + `app/admin/authors/page.tsx` + `app/admin/authors/[id]/page.tsx` (+ `new`).
- **D3** `components/admin/BlogForm.tsx`: author `<Select>` from a `authors: {id, nameEn}[]` prop.
- **D4** Editor pages pass authors; `AdminShell` sidebar entry; admin i18n keys.

### E — Gate & ship
- Full suite + `tsc` + production build (confirm `/admin/authors`, article, list routes).
- Merge `blog-authors` → `master`, push.
