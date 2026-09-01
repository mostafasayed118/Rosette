-- Production search uses PostgreSQL full-text search with the existing ILIKE
-- branch retained as a compatibility fallback until this migration is applied.
alter table public.products add column if not exists search_vector tsvector;

create or replace function public.refresh_product_search_vector()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.search_vector := to_tsvector(
    'simple',
    concat_ws(' ', new.slug, new.name_en, new.name_ar, new.name_fr,
      new.description_en, new.description_ar, new.description_fr)
  );
  return new;
end;
$$;

drop trigger if exists products_search_vector_trigger on public.products;
create trigger products_search_vector_trigger
before insert or update of slug, name_en, name_ar, name_fr, description_en, description_ar, description_fr
on public.products
for each row execute function public.refresh_product_search_vector();

update public.products
set search_vector = to_tsvector(
  'simple',
  concat_ws(' ', slug, name_en, name_ar, name_fr, description_en, description_ar, description_fr)
)
where search_vector is null;

create index if not exists products_search_vector_idx
  on public.products using gin(search_vector);
