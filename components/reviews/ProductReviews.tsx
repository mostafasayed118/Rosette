import { getServerT } from '@/features/i18n/server';
import { getCurrentCustomer } from '@/features/auth/customer';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { StarRating } from '@/components/ui/StarRating';
import { ReviewForm, type ReviewFormState } from './ReviewForm';
import { HelpfulButton } from './HelpfulButton';
import type { ApprovedReviewData } from '@/features/reviews/get-approved-reviews';

export async function ProductReviews({ productSlug, locale, data }: { productSlug: string; locale: string; data: ApprovedReviewData | null }) {
  const { t } = await getServerT(locale);
  if (!data || !data.productId) return null;
  const { reviews, aggregate } = data;
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
    const eligibleOrder = rows.find((order) => (order.order_items ?? []).some((item) => item.product_slug === productSlug || item.product_id === data.productId));
    const { data: existing } = eligibleOrder ? await getAdminSupabase().from('product_reviews').select('id').eq('order_id', eligibleOrder.id).eq('product_id', data.productId).maybeSingle() : { data: null };
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
        <div className="mt-6 grid grid-cols-[minmax(0,20rem)_minmax(0,1fr)] gap-12 max-md:grid-cols-1">
          <div className="grid content-start gap-5">
            <p className="flex items-baseline gap-3">
              <span className="font-display text-5xl leading-none text-primary">{aggregate.average.toFixed(1)}</span>
              <span className="grid gap-1"><StarRating value={Math.round(aggregate.average)} /><span className="price text-xs text-muted-foreground">{t('reviewAverage', { average: aggregate.average.toFixed(1), count: aggregate.count })}</span></span>
            </p>
            <div className="grid gap-1.5">
              {breakdown.map(({ star, count }) => (
                <p key={star} className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="w-8 shrink-0">{star} ★</span>
                  <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-muted"><span className="block h-full rounded-full bg-primary/70" style={{ width: `${aggregate.count ? Math.round((count / aggregate.count) * 100) : 0}%` }} /></span>
                  <span className="price w-8 shrink-0 text-end">{count}</span>
                </p>
              ))}
            </div>
          </div>
          <div className="grid content-start">
            {reviews.map((review) => (
              <article key={review.id} className="border-b border-border/60 py-5 first:pt-0 last:border-b-0">
                <div className="flex flex-wrap items-center gap-2">
                  <StarRating value={review.rating} />
                  <strong className="text-sm font-semibold">{review.displayName ?? t('verifiedCustomer')}</strong>
                </div>
                <p className="mt-1.5 leading-relaxed">{review.body}</p>
                {review.photos.length > 0 ? (
                  <div className="mt-2.5 flex flex-wrap gap-2">
                    {review.photos.slice(0, 3).map((url) => (
                      <img key={url} src={url} alt="" className="h-20 w-20 rounded-xl object-cover" />
                    ))}
                  </div>
                ) : null}
                <div className="mt-2 flex items-center gap-3">
                  <span className="price text-xs text-muted-foreground">{new Date(review.createdAt).toLocaleDateString(locale === 'ar' ? 'ar-EG' : locale === 'fr' ? 'fr-FR' : 'en-GB')}</span>
                  <HelpfulButton reviewId={review.id} />
                </div>
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
