export type ReviewSubmitEligibility = 'ok' | 'not_verified' | 'already_reviewed';

export function isEligibleOrderPayment(paymentStatus: string): boolean {
  return paymentStatus === 'paid';
}

export function canSubmitReview(input: { hasPaidOrderForProduct: boolean; alreadyReviewed: boolean }): ReviewSubmitEligibility {
  if (!input.hasPaidOrderForProduct) return 'not_verified';
  if (input.alreadyReviewed) return 'already_reviewed';
  return 'ok';
}

export function clampRating(value: unknown): number {
  const rating = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return 0;
  return rating;
}

export function cleanReviewBody(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const body = value.trim();
  if (body.length === 0 || body.length > 400) return null;
  return body;
}
