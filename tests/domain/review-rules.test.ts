import { describe, expect, it } from 'vitest';
import { canSubmitReview, clampRating, cleanReviewBody, isEligibleOrderPayment } from '@/features/reviews/review-rules';

describe('isEligibleOrderPayment', () => {
  it('accepts paid and rejects every other status', () => {
    expect(isEligibleOrderPayment('paid')).toBe(true);
    expect(isEligibleOrderPayment('pending')).toBe(false);
    expect(isEligibleOrderPayment('payment_started')).toBe(false);
    expect(isEligibleOrderPayment('payment_failed')).toBe(false);
    expect(isEligibleOrderPayment('refunded')).toBe(false);
    expect(isEligibleOrderPayment('cancelled')).toBe(false);
  });
});

describe('canSubmitReview', () => {
  it('allows a verified customer with no prior review', () => {
    expect(canSubmitReview({ hasPaidOrderForProduct: true, alreadyReviewed: false })).toBe('ok');
  });
  it('blocks customers without a paid order for the product', () => {
    expect(canSubmitReview({ hasPaidOrderForProduct: false, alreadyReviewed: false })).toBe('not_verified');
  });
  it('blocks duplicates even when verified', () => {
    expect(canSubmitReview({ hasPaidOrderForProduct: true, alreadyReviewed: true })).toBe('already_reviewed');
  });
});

describe('clampRating', () => {
  it('parses numeric ratings in range', () => {
    expect(clampRating(5)).toBe(5);
    expect(clampRating('3')).toBe(3);
    expect(clampRating(1)).toBe(1);
  });
  it('returns 0 for invalid or out-of-range values', () => {
    expect(clampRating('abc')).toBe(0);
    expect(clampRating(0)).toBe(0);
    expect(clampRating(6)).toBe(0);
    expect(clampRating(-1)).toBe(0);
    expect(clampRating(null)).toBe(0);
  });
});

describe('cleanReviewBody', () => {
  it('trims surrounding whitespace', () => {
    expect(cleanReviewBody('  lovely  ')).toBe('lovely');
  });
  it('returns null for empty or whitespace-only input', () => {
    expect(cleanReviewBody('   ')).toBeNull();
    expect(cleanReviewBody('')).toBeNull();
    expect(cleanReviewBody(null)).toBeNull();
  });
  it('returns null when the body exceeds 400 chars', () => {
    expect(cleanReviewBody('a'.repeat(401))).toBeNull();
    expect(cleanReviewBody('a'.repeat(400))).toBe('a'.repeat(400));
  });
});
