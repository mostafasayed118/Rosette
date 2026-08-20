import { getServerSupabase } from '@/lib/supabase/server';
import { ratingBySlug, type ReviewAggregate } from '@/features/reviews/aggregate';

export type ApprovedReview = { id: string; rating: number; body: string; createdAt: string; photos: string[]; displayName?: string | null };
export type ApprovedReviewData = { productId: string | null; reviews: ApprovedReview[]; aggregate: ReviewAggregate };

export async function getApprovedReviews(productSlug: string): Promise<ApprovedReviewData | null> {
  const supabase = await getServerSupabase();
  if (!supabase) return null;
  const { data: product } = await supabase.from('products').select('id').eq('slug', productSlug).maybeSingle();
  if (!product) return null;
  const { data: reviewRows } = await supabase.from('product_reviews')
    .select('id,rating,body,created_at,photos,profiles(display_name)')
    .eq('product_id', product.id)
    .eq('status', 'approved')
    .order('created_at', { ascending: false });
  const reviews = ((reviewRows ?? []) as Array<{ id: string; rating: number; body: string; created_at: string; photos?: unknown; profiles?: { display_name?: string | null } | null }>)
    .map((row): ApprovedReview => ({ id: String(row.id), rating: Number(row.rating), body: String(row.body), createdAt: String(row.created_at), photos: Array.isArray(row.photos) ? row.photos.filter((p: unknown): p is string => typeof p === 'string') : [], displayName: row.profiles?.display_name ?? null }));
  const aggregate = ratingBySlug(reviews.map((review) => ({ product_slug: productSlug, rating: review.rating, status: 'approved' }))).get(productSlug) ?? { average: 0, count: 0 };
  return { productId: String(product.id), reviews, aggregate };
}
