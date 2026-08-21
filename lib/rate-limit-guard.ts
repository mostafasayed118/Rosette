import { NextResponse } from 'next/server';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';

export type RateLimitRule = { bucket: string; limit: number; windowMs: number; error: string };

/**
 * Enforce a rate limit inside a route handler (Cloudflare has no middleware).
 * Returns a 429 response when the caller is over the limit, otherwise null.
 */
export function enforceRateLimit(request: Request, rule: RateLimitRule): NextResponse | null {
  const result = checkRateLimit({ bucket: rule.bucket, identifier: getClientIp(request), limit: rule.limit, windowMs: rule.windowMs });
  if (result.allowed) return null;
  return NextResponse.json({ error: rule.error }, { status: 429, headers: { 'Retry-After': String(result.retryAfterSeconds) } });
}

export const RATE_LIMITS = {
  chat: { bucket: 'chat', limit: 10, windowMs: 5 * 60_000, error: 'Too many chat messages. Please wait a moment.' },
  orders: { bucket: 'orders', limit: 20, windowMs: 10 * 60_000, error: 'Too many order attempts. Please wait a moment.' },
  reviewVote: { bucket: 'review-vote', limit: 30, windowMs: 10 * 60_000, error: 'Too many votes. Please wait a moment.' },
  giftCardPurchase: { bucket: 'gift-card-purchase', limit: 10, windowMs: 10 * 60_000, error: 'Too many gift-card attempts. Please wait a moment.' },
  promoValidate: { bucket: 'promo-validate', limit: 20, windowMs: 5 * 60_000, error: 'Too many promo attempts. Please wait a moment.' },
  reviewSubmit: { bucket: 'review-submit', limit: 5, windowMs: 10 * 60_000, error: 'Too many review submissions. Please wait a moment.' },
} as const satisfies Record<string, RateLimitRule>;
