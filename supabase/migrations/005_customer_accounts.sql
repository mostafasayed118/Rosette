-- Customer accounts: auto-create a profile on signup, let customers edit their
-- own profile, and block customers from changing their own role.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, role, created_at)
  values (new.id, 'customer', now())
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

drop policy if exists "users can update own profile" on public.profiles;
create policy "users can update own profile"
  on public.profiles
  for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Defense in depth: a non-admin must never be able to promote their own role.
create or replace function public.prevent_role_escalation()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.role is distinct from old.role then
    if not exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'operator')
    ) then
      raise exception 'ROLE_CHANGE_FORBIDDEN';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_role_escalation on public.profiles;
create trigger prevent_role_escalation
  before update on public.profiles
  for each row execute procedure public.prevent_role_escalation();

-- Backfill profiles for any existing auth.users that lack one.
insert into public.profiles (id, role, created_at)
select u.id, 'customer', now()
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id)
on conflict (id) do nothing;
