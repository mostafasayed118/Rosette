-- Author profiles for blog posts.
-- Authors are public once created (no publish flag) and are referenced by
-- blog_posts.author_id; deleting an author leaves the posts intact (set null).

create table if not exists public.authors (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name_en text not null,
  name_ar text,
  name_fr text,
  role_en text,
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
  for select using (true);

alter table public.blog_posts
  add column if not exists author_id uuid references public.authors(id) on delete set null;

create index if not exists blog_posts_author_idx on public.blog_posts (author_id);
