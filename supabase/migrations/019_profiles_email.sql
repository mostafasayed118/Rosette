-- The engagement crons (wishlist, occasions-cron) select `profiles(email)`
-- through PostgREST, but no earlier migration ever created the column: the
-- production database carries it as a hand-applied patch. Capture it here so
-- a fresh database built from these migrations matches what the code queries,
-- instead of every cron run failing its select silently.
alter table public.profiles add column if not exists email text;

-- Backfill existing accounts from the auth user.
update public.profiles p
set email = u.email
from auth.users u
where p.id = u.id and p.email is null;

-- Keep it in sync whenever the auth email is set or changes. Fires after
-- on_auth_user_created (trigger names fire alphabetically), so the profile
-- row exists by the time this runs on signup.
create or replace function public.sync_profile_email()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  update public.profiles set email = new.email where id = new.id;
  return new;
end;
$$;

drop trigger if exists on_auth_user_email_synced on auth.users;
create trigger on_auth_user_email_synced
  after insert or update of email on auth.users
  for each row execute procedure public.sync_profile_email();
