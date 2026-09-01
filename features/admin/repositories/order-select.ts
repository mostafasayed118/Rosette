import { orderSelect } from '@/features/order/types';

/**
 * Canonical order column lists for the admin layer.
 *
 * These strings used to be duplicated across `features/admin/order-actions.ts`,
 * `app/admin/change-requests/page.tsx` and `app/admin/cancel-requests/page.tsx`,
 * which let them drift apart. Everything now derives from the single
 * `orderSelect` projection in `features/order/types.ts` (R-16).
 */

/** Full order row — use when the caller needs to act on the order. */
export const ADMIN_ORDER_SELECT = orderSelect;

/** Order row plus the line items needed to recompute totals on a change. */
export const ADMIN_ORDER_SELECT_WITH_ITEMS = `${orderSelect},order_items(id,unit_price_minor,quantity,gift_message,product_name_en)`;

/**
 * Compact projection for list/queue views. It is deliberately assembled from
 * the same source list via `orderColumns()` so a renamed column cannot silently
 * drop out of one surface only.
 */
export const ADMIN_ORDER_SUMMARY_SELECT = [
  'id',
  'display_number',
  'customer_email',
  'total_minor',
  'subtotal_minor',
  'delivery_fee_minor',
  'discount_minor',
  'payment_status',
  'fulfillment_status',
].join(',');

/** Assert at module load that every summary column exists in the canonical list. */
const CANONICAL_COLUMNS = new Set(orderSelect.split(',').map((column) => column.trim()));
for (const column of ADMIN_ORDER_SUMMARY_SELECT.split(',')) {
  if (!CANONICAL_COLUMNS.has(column)) {
    throw new Error(`ADMIN_ORDER_SUMMARY_SELECT column "${column}" is missing from the canonical orderSelect`);
  }
}
