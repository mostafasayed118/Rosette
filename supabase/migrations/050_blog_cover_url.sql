-- Blog cover image for admin thumbnails and storefront cards.
-- Commit 740dfa8 added `cover_url` to the admin select and `BlogPostSummary.coverUrl`
-- without a schema migration; this backfills the missing column so
-- `features/admin/blog-admin.ts:listAllBlogPosts` stops crashing with
-- "column blog_posts.cover_url does not exist" on fresh or already-deployed DBs.
-- No index: no query filters or sorts on `cover_url` (it is display-only).

alter table public.blog_posts
  add column if not exists cover_url text;
