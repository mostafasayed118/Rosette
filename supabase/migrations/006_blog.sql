-- Blog & SEO content engine.
-- Posts (type='post') and per-city landing pages (type='city') are authored
-- in the admin and read publicly only when published.

create table if not exists public.blog_posts (
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

create index if not exists blog_posts_published_idx on public.blog_posts (type, published, published_at desc);
create index if not exists blog_posts_city_idx on public.blog_posts (city_code) where type = 'city';

alter table public.blog_posts enable row level security;

create policy "public can read published blog posts" on public.blog_posts
  for select using (published = true);
