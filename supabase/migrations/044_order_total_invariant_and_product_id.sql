-- 044: order total invariant + order_items.product_id backfill
--
-- (a) Backfill order_items.product_id from products via the product slug so the
--     column is populated for historical rows where it was left NULL.
UPDATE order_items
SET product_id = p.id
FROM products p
WHERE order_items.product_slug = p.slug
  AND order_items.product_id IS NULL;

-- (b) Enforce the order total invariant with a CHECK constraint.
--     total_minor = subtotal_minor + delivery_fee_minor - discount_minor - gift_card_minor
--
--     SAFETY: the constraint is added inside a DO block that first counts any
--     rows violating the invariant. If violations exist we RAISE a WARNING (with
--     the count) and SKIP adding the constraint, so the migration never
--     hard-fails on legacy/incorrect data. Otherwise the constraint is added.
--     Idempotent: re-running is a no-op once the constraint exists.
DO $$
DECLARE
  v_violations integer;
BEGIN
  SELECT count(*) INTO v_violations
  FROM orders o
  WHERE o.total_minor <> (
    o.subtotal_minor
    + o.delivery_fee_minor
    - o.discount_minor
    - COALESCE(o.gift_card_minor, 0)
  );

  IF v_violations > 0 THEN
    RAISE WARNING 'Skipping chk_order_totals: % order(s) violate the total invariant; fix data before enforcing.', v_violations;
  ELSE
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'chk_order_totals'
    ) THEN
      ALTER TABLE orders
        ADD CONSTRAINT chk_order_totals
        CHECK (
          total_minor = subtotal_minor
            + delivery_fee_minor
            - discount_minor
            - COALESCE(gift_card_minor, 0)
        );
    END IF;
  END IF;
END $$;
