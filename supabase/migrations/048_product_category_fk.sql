-- 048: add a proper foreign-key relationship between products and categories.
--
-- products.category currently stores a category SLUG (text, NOT NULL) matching
-- categories.slug. The categories primary key is `id uuid`, so the FK we want
-- targets categories(id), not the slug. We add a typed `category_id uuid`
-- column, backfill it from the existing slug via the categories table, then
-- enforce the FK.
--
-- SAFETY / IDEMPOTENCY:
--   * All DDL uses IF NOT EXISTS guards, so re-running is a no-op once applied.
--   * The backfill only fills rows where the slug matches; unmatched products
--     are left NULL (the column is intentionally nullable) and the FK is added
--     inside a DO block guarded by a NOT EXISTS check, so it never hard-fails.

-- (a) Add the typed FK column. Type matches categories PK (uuid).
alter table public.products
  add column if not exists category_id uuid;

-- (b) Backfill category_id from the existing products.category slug.
--     Rows whose slug no longer exists in categories.slug are left NULL.
update public.products p
set category_id = c.id
from public.categories c
where p.category = c.slug
  and p.category_id is null;

-- (c) Enforce the foreign key to categories(id).
--     Idempotent: skipped if the constraint already exists.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'fk_product_category'
  ) then
    alter table public.products
      add constraint fk_product_category
      foreign key (category_id)
      references public.categories(id)
      on delete set null;
  end if;
end $$;
