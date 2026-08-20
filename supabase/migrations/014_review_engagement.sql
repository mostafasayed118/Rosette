alter table public.product_reviews
  add column photos jsonb not null default '[]'::jsonb;

create table if not exists public.review_votes (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.product_reviews(id) on delete cascade,
  voter_key text not null,
  created_at timestamptz not null default now(),
  unique (review_id, voter_key)
);

create index if not exists review_votes_review_idx on public.review_votes(review_id);

alter table public.review_votes enable row level security;

insert into storage.buckets (id, name, public)
values ('review-images', 'review-images', true)
on conflict (id) do nothing;
