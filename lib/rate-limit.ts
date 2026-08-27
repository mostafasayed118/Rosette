import { logger } from './logger';
import { isUpstashConfigured, upstashFixedWindow } from './rate-limit-upstash';

type Bucket = { count: number; resetAt: number };

const store = new Map<string, Bucket>();

/** Prune expired windows so a long-lived isolate cannot leak memory. */
function prune(now: number): void {
  for (const [key, bucket] of store) {
    if (bucket.resetAt <= now) store.delete(key);
  }
}

export type RateLimitInput = { bucket: string; identifier: string; limit: number; windowMs: number };
export type RateLimitResult = { allowed: boolean; remaining: number; retryAfterSeconds: number };

function memoryFixedWindow({ bucket, identifier, limit, windowMs }: RateLimitInput): RateLimitResult {
  const now = Date.now();
  prune(now);

  const key = `${bucket}:${identifier}`;
  const existing = store.get(key);

  if (!existing || existing.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: Math.max(0, limit - 1), retryAfterSeconds: 0 };
  }

  if (existing.count >= limit) {
    return { allowed: false, remaining: 0, retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)) };
  }

  existing.count += 1;
  return { allowed: true, remaining: Math.max(0, limit - existing.count), retryAfterSeconds: 0 };
}

/**
 * Fixed-window rate limiting.
 *
 * Primary engine: Upstash Redis over its REST API — the counter is shared
 * across Cloudflare Workers isolates, so limits survive scale-out and deploys.
 * Fallback engine: in-isolate memory, which reliably stops burst abuse from a
 * single client with zero extra infrastructure but does not share state
 * across isolates. The Upstash call is time-boxed; any failure downgrades to
 * the memory engine for that request instead of failing the endpoint.
 */
export async function checkRateLimit(input: RateLimitInput): Promise<RateLimitResult> {
  if (isUpstashConfigured()) {
    try {
      return await upstashFixedWindow(input);
    } catch (error) {
      logger.warn('rate_limit.upstash_unavailable', { error });
    }
  }
  return memoryFixedWindow(input);
}

/** Test helper: clear all windows. */
export function resetRateLimits(): void {
  store.clear();
}

/** Resolve the client IP, trusting Cloudflare's header first. */
export function getClientIp(request: Request): string {
  const cloudflare = request.headers.get('CF-Connecting-IP');
  if (cloudflare) return cloudflare.trim();
  const forwarded = request.headers.get('X-Forwarded-For');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  const real = request.headers.get('X-Real-IP');
  if (real) return real.trim();
  return 'unknown';
}

