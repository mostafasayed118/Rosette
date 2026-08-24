-- The storefront catalog join (features/catalog/supabase-repository.ts) reads
-- product_variants and their per-variant inventory through the anon key.
-- RLS is enabled on both tables with no SELECT policy, so anon reads return
-- zero rows and product pages render without size selectors. Grant public
-- read access; writes stay server-side (service_role bypasses RLS).
alter table public.product_variants enable row level security;
alter table public.inventory enable row level security;

drop policy if exists "public can read product variants" on public.product_variants;
create policy "public can read product variants"
  on public.product_variants for select
  using (true);

drop policy if exists "public can read inventory" on public.inventory;
create policy "public can read inventory"
  on public.inventory for select
  using (true);
