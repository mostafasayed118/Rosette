import { canSubmitReview, clampRating, cleanReviewBody, isEligibleOrderPayment } from './review-rules';
import { isReviewImageUrl, REVIEW_PHOTO_MAX } from './review-storage';
import type { AdminIdentity } from '@/features/admin/authorization';

type ReviewClient = { from: (table: string) => any };

export type SubmitReviewResult =
  | { status: 'created' }
  | { status: 'invalid' }
  | { status: 'not_found' }
  | { status: 'not_verified' }
  | { status: 'already_reviewed' }
  | { status: 'failure' };

export async function submitProductReview(
  client: ReviewClient,
  input: { customerId: string; productSlug: string; rating: unknown; body: unknown; photoUrls?: string[] },
): Promise<SubmitReviewResult> {
  try {
    const rating = clampRating(input.rating);
    const body = cleanReviewBody(input.body);
    if (rating === 0 || body === null) return { status: 'invalid' };

    const photoUrls = Array.isArray(input.photoUrls) ? input.photoUrls : [];
    if (photoUrls.length > REVIEW_PHOTO_MAX || photoUrls.some((url) => !isReviewImageUrl(url))) return { status: 'invalid' };

    const { data: product } = await client.from('products').select('id').eq('slug', input.productSlug).maybeSingle();
    if (!product) return { status: 'not_found' };

    const { data: orders } = await client.from('orders')
      .select('id,created_at,payment_status,order_items(product_slug,product_id)')
      .eq('customer_id', input.customerId)
      .order('created_at', { ascending: false })
      .limit(10);
    const rows = (orders ?? []) as Array<{ id: string; payment_status: string; order_items?: Array<{ product_slug?: string | null; product_id?: string | null }> }>;
    const eligibleOrder = rows
      .filter((order) => isEligibleOrderPayment(order.payment_status))
      .find((order) => (order.order_items ?? []).some((item) => item.product_slug === input.productSlug || item.product_id === product.id));
    if (!eligibleOrder) return { status: 'not_verified' };

    const { data: existing } = await client.from('product_reviews').select('id').eq('order_id', eligibleOrder.id).eq('product_id', product.id).maybeSingle();
    const eligibility = canSubmitReview({ hasPaidOrderForProduct: true, alreadyReviewed: Boolean(existing) });
    if (eligibility !== 'ok') return { status: eligibility };

    const { error } = await client.from('product_reviews').insert({ product_id: product.id, order_id: eligibleOrder.id, customer_id: input.customerId, rating, body, status: 'pending', photos: photoUrls }).select('id').single();
    if (error) return { status: 'failure' };
    return { status: 'created' };
  } catch {
    return { status: 'failure' };
  }
}

export type ReviewActionResult =
  | { status: 'approved' }
  | { status: 'rejected' }
  | { status: 'not_found' }
  | { status: 'failure' };

export async function reviewProductReview(
  client: ReviewClient,
  input: { admin: AdminIdentity; reviewId: string; action: 'approve' | 'reject' },
): Promise<ReviewActionResult> {
  try {
    if (input.action === 'reject') {
      const { error } = await client.from('product_reviews').delete().eq('id', input.reviewId);
      if (error) return { status: 'failure' };
      return { status: 'rejected' };
    }
    const { error } = await client.from('product_reviews').update({ status: 'approved', reviewed_by: input.admin.userId, reviewed_at: new Date().toISOString() }).eq('id', input.reviewId);
    if (error) return { status: 'failure' };
    return { status: 'approved' };
  } catch {
    return { status: 'failure' };
  }
}
