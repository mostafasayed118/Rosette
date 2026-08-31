-- Migration 047: add missing indexes on hot columns (perf, R-21)
--
-- NOTE ON CONCURRENTLY / TRADEOFF:
-- The Supabase CLI wraps every migration file in a single transaction by default,
-- and `CREATE INDEX CONCURRENTLY` is rejected inside a transaction block
-- ("CREATE INDEX CONCURRENTLY cannot run inside a transaction block"). Using it
-- here would break `supabase db push`. We therefore use plain
-- `CREATE INDEX IF NOT EXISTS`, which is applied inside the migration transaction.
-- Tradeoff: on very large tables this takes an ACCESS EXCLUSIVE lock for the
-- duration of the build. For a zero-downtime online build, an operator can instead
-- run the equivalent `CREATE INDEX CONCURRENTLY` statements out-of-band (e.g. via
-- the Supabase SQL editor or `supabase db execute`) before deploying this file:
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS ...
-- Once CONCURRENTLY has created the index, this file's `IF NOT EXISTS` is a no-op.
--
-- All statements are idempotent (IF NOT EXISTS) so the file is safe to re-run.

-- product_variants(product_id): FK lookups for variant-by-product queries (hot path).
CREATE INDEX IF NOT EXISTS idx_product_variants_product_id
  ON product_variants (product_id);

-- payments(order_id): FK lookups joining payments to their order (hot path).
CREATE INDEX IF NOT EXISTS idx_payments_order_id
  ON payments (order_id);

-- product_reviews(product_id, status, created_at DESC): list/recent approved
-- reviews for a product, ordered newest-first (hot path).
CREATE INDEX IF NOT EXISTS idx_product_reviews_product_id_status_created_at
  ON product_reviews (product_id, status, created_at DESC);

-- products(category): category-filter / browse queries (hot path).
CREATE INDEX IF NOT EXISTS idx_products_category
  ON products (category);

-- products(price_minor): price-range and sort queries (hot path).
CREATE INDEX IF NOT EXISTS idx_products_price_minor
  ON products (price_minor);
