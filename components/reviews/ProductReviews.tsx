import { getServerSupabase } from '@/lib/supabase/server';
import { getServerT } from '@/features/i18n/server';
import { getCurrentCustomer } from '@/features/auth/customer';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { StarRating } from '@/components/ui/StarRating';
import { ReviewForm, type ReviewFormState } from './ReviewForm';
import { ratingBySlug, type ReviewRatingRow } from '@/features/reviews/aggregate';

export async function ProductReviews({ productSlug, locale }: { productSlug: string; locale: string }) {
  const { t } = await getServerT();
  const supabase = await getServerSupabase();
  if (!supabase) return null;
  const { data: product } = await supabase.from('products').select('id').eq('slug', productSlug).maybeSingle();
  if (!product) return null;

  const { data: reviewRows } = await supabase.from('product_reviews')
    .select('id,rating,body,created_at,profiles(display_name)')
    .eq('product_id', product.id)
    .eq('status', 'approved')
    .order('created_at', { ascending: false });
  const reviews = (reviewRows ?? []) as Array<{ id: string; rating: number; body: string; created_at: string; profiles?: { display_name?: string | null } | null }>;
  const aggregate = ratingBySlug(reviews.map((row): ReviewRatingRow => ({ product_slug: productSlug, rating: row.rating, status: 'approved' }))).get(productSlug);
  const breakdown = [5, 4, 3, 2, 1].map((star) => ({ star, count: reviews.filter((row) => row.rating === star).length }));

  let formState: ReviewFormState = 'anonymous';
  const customer = await getCurrentCustomer();
  if (customer) {
    const { data: orders } = await getAdminSupabase().from('orders')
      .select('id,order_items(product_slug,product_id)')
      .eq('customer_id', customer.id)
      .eq('payment_status', 'paid')
      .limit(10);
    const rows = (orders ?? []) as Array<{ id: string; order_items?: Array<{ product_slug?: string | null; product_id?: string | null }> }>;
    const eligibleOrder = rows.find((order) => (order.order_items ?? []).some((item) => item.product_slug === productSlug || item.product_id === product.id));
    const { data: existing } = eligibleOrder ? await getAdminSupabase().from('product_reviews').select('id').eq('order_id', eligibleOrder.id).eq('product_id', product.id).maybeSingle() : { data: null };
    formState = !eligibleOrder ? 'not-verified' : existing ? 'already-reviewed' : 'can-review';
  }

  return (
    <section className="mt-16 border-t pt-10">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <h2 className="font-display text-3xl">{t('reviews')}</h2>
        {aggregate && aggregate.count > 0 ? (
          <p className="text-sm text-muted-foreground">{t('reviewAverage', { average: aggregate.average.toFixed(1), count: aggregate.count })}</p>
        ) : null}
      </div>

      {aggregate && aggregate.count > 0 ? (
        <div className="mt-4 grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-8 max-md:grid-cols-1">
          <div className="grid gap-2">
            {breakdown.map(({ star, count }) => (
              <p key={star} className="flex items-center gap-3 text-sm text-muted-foreground">
                <StarRating value={star} size={12} /> {star} · {count}
              </p>
            ))}
          </div>
          <div className="grid content-start gap-4">
            {reviews.map((review) => (
              <article key={review.id} className="border-b pb-4">
                <div className="flex items-center gap-2"><StarRating value={review.rating} />{review.profiles?.display_name ?? t('verifiedCustomer')}</div>
                <p className="mt-1 text-sm">{review.body}</p>
                <p className="mt-1 text-xs text-muted-foreground">{new Date(review.created_at).toLocaleDateString(locale === 'ar' ? 'ar-EG' : locale === 'fr' ? 'fr-FR' : 'en-GB')}</p>
              </article>
            ))}
          </div>
        </div>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">{t('noReviews')}</p>
      )}

      <div className="mt-10">
        <h3 className="font-display text-xl">{t('writeReview')}</h3>
        <div className="mt-3 max-w-xl"><ReviewForm productSlug={productSlug} state={formState} /></div>
      </div>
    </section>
  );
}
