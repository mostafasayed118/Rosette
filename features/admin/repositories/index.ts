/**
 * Admin data-access boundary (R-16).
 *
 * Every admin page reads through one of these repositories instead of calling
 * `getAdminSupabase()` inline. Repositories own the query shape, the row →
 * domain mapping, and any money arithmetic; pages own presentation only.
 */
export { getAdminClient, type AdminClient } from './client';
export { ADMIN_ORDER_SELECT, ADMIN_ORDER_SELECT_WITH_ITEMS, ADMIN_ORDER_SUMMARY_SELECT } from './order-select';
export { getDashboardStats, type DashboardStats } from './dashboard';
export { listAdminOrders, getAdminOrderDetail, type AdminOrderRow, type AdminOrderDetail } from './orders';
export { listChangeRequests, priceChangeRequest, type ChangeRequestRow, type ChangeRequestQueues, type ChangeRequestPricing, type ChangeRequestOrderItem, type ChangeRequestOrder } from './change-requests';
export { listCancelRequests, type CancelRequestRow, type CancelRequestQueues } from './cancel-requests';
export { listAdminProducts, getAdminProduct, type AdminProductRow, type AdminProductDetail, type AdminProductVariantRow, type AdminProductAddOnRow } from './products';
export { listAdminPromos, type AdminPromoRow } from './promos';
export { listAdminCities, type AdminCityRow, type AdminCityRule } from './cities';
export { listAdminReviewQueues, type AdminReviewRow, type AdminReviewQueues } from './reviews';
export { listAdminInventory, type AdminInventoryRow } from './inventory';
export { listAdminAuthors, getAdminAuthor, type AdminAuthorRow } from './authors';
export { listAdminBlogPosts, listAdminAuthorOptions, getAdminBlogPost, type AdminAuthorOption } from './blog';
export { listAdminPlans, getAdminPlan, type AdminPlanRow, type AdminPlanDetail, type AdminBundlePrice } from './subscription-plans';
export { mapReviewerNames } from './profiles';
