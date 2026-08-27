create table if not exists public.user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  reduce_motion boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_preferences enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'user_preferences_owner' and tablename = 'user_preferences') then
    create policy user_preferences_owner on public.user_preferences for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end $$;

alter table public.user_preferences add column if not exists reduce_motion boolean not null default false;
