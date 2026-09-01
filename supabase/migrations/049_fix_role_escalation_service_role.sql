-- 049: allow service_role to change profile roles (fixes test-admin promotion)
--
-- The trigger `prevent_role_escalation` (005) blocked *every* role change where
-- auth.uid() was not an admin/operator. That includes service_role (auth.uid()
-- is NULL, auth.role() = 'service_role'), so even `SUPABASE_SERVICE_ROLE_KEY`
-- could not promote a user — `update profiles set role='admin'` always raised
-- ROLE_CHANGE_FORBIDDEN. The admin boundary is service_role-only by design;
-- the trigger must exempt it.

create or replace function public.prevent_role_escalation()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.role is distinct from old.role then
    -- service_role bypasses RLS by design and must be able to set roles
    -- (e.g. initial admin seeding, admin promotions via dashboard).
    if auth.role() = 'service_role' then
      return new;
    end if;
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

-- Recreate trigger after function update
drop trigger if exists prevent_role_escalation on public.profiles;
create trigger prevent_role_escalation
  before update on public.profiles
  for each row execute procedure public.prevent_role_escalation();

-- Promote the seeded test admin if it exists (idempotent)
-- The new trigger allows service_role, but this migration runs as `postgres`
-- (auth.role() is null), so we temporarily disable the trigger for this row.
alter table public.profiles disable trigger prevent_role_escalation;
update public.profiles
  set role = 'admin'
  where id = 'a9ba3186-f15d-4643-b5a2-02f68b0ee06a'
    and role <> 'admin';
alter table public.profiles enable trigger prevent_role_escalation;
