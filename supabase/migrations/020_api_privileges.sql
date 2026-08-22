-- Migrations run as the `postgres` role, and current Supabase defaults no
-- longer auto-grant the Data API roles access to tables postgres creates
-- (this project's config.toml leaves auto_expose_new_tables off). Without
-- explicit grants every REST query -- storefront reads, server actions, and
-- both engagement crons -- dies with `permission denied` on a database built
-- purely from these migrations. Grant the standard Supabase surface here.
-- Row level security stays the real gate for anon/authenticated; service_role
-- bypasses RLS by design and powers the admin client.
grant usage on schema public to anon, authenticated, service_role;

grant select, insert, update, delete on all tables in schema public
  to anon, authenticated, service_role;

-- Keep future migration-created tables reachable without relying on the
-- deprecated auto-expose behaviour.
alter default privileges in schema public
  grant select, insert, update, delete on tables to anon, authenticated, service_role;
