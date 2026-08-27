-- 032_orders_locale_fr.sql
--
-- French localization (003_french_localization.sql) shipped after
-- 001_commerce.sql froze orders.locale to ('en', 'ar'). The checkout API
-- accepts 'fr' and create_pending_order inserts the locale verbatim
-- (024_create_pending_order.sql line ~71), so every French order violated
-- the table CHECK and rolled back the whole order transaction.
--
-- Idempotent: drop-if-exists + add, so it is safe to run repeatedly and
-- consistent across environments regardless of prior shape.

alter table public.orders drop constraint if exists orders_locale_check;
alter table public.orders add constraint orders_locale_check
  check (locale = any (array['en'::text, 'ar'::text, 'fr'::text]));
