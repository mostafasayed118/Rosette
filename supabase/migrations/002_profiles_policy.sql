-- Allow an authenticated user to read their own profile row.
-- Required by getCurrentAdmin(): it resolves the session user, then reads
-- profiles.role to decide admin access. Without this policy RLS blocks the
-- read and every admin page redirects to /login.
create policy "users can read own profile"
  on public.profiles
  for select
  using (auth.uid() = id);
