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
