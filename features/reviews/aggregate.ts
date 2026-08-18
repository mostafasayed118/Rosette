export type ReviewRatingRow = { product_slug?: string | null; rating: number; status: string };
export type ReviewAggregate = { average: number; count: number };

export function ratingBySlug(rows: ReviewRatingRow[]): Map<string, ReviewAggregate> {
  const sums = new Map<string, { sum: number; count: number }>();
  for (const row of rows) {
    if (row.status !== 'approved' || !row.product_slug) continue;
    const entry = sums.get(row.product_slug) ?? { sum: 0, count: 0 };
    entry.sum += row.rating;
    entry.count += 1;
    sums.set(row.product_slug, entry);
  }
  const result = new Map<string, ReviewAggregate>();
  for (const [slug, { sum, count }] of sums) {
    result.set(slug, { average: Math.round((sum / count) * 10) / 10, count });
  }
  return result;
}

export const NO_REVIEWS: ReviewAggregate = { average: 0, count: 0 };
