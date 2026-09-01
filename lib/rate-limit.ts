import { logger } from './logger';
import { isUpstashConfigured, upstashFixedWindow } from './rate-limit-upstash';
import { getDeploymentRuntime } from './runtime-config';

type Bucket = { count: number; resetAt: number };

const store = new Map<string, Bucket>();

/** Hard cap on in-memory windows so attacker-controlled identifiers cannot grow the map without bound. */
const MAX_ENTRIES = 10_000;
/** Only scan the map for expired windows every N calls; per-request work stays O(1). */
const PRUNE_INTERVAL = 1_000;
let callCounter = 0;

/**
 * Lazy expiry sweep. Runs at most once every PRUNE_INTERVAL invocations, so a
 * single request never iterates the whole map. Bounded (O(size/PRUNE_INTERVAL)
 * amortised) by MAX_ENTRIES below.
 */
function maybePrune(now: number): void {
  callCounter += 1;
  if (callCounter < PRUNE_INTERVAL) return;
  callCounter = 0;
  for (const [key, bucket] of store) {
    if (bucket.resetAt <= now) store.delete(key);
  }
}

/** Evict the oldest-inserted entries (Map preserves insertion order) when over cap. */
function evictIfNeeded(): void {
  if (store.size <= MAX_ENTRIES) return;
  const overflow = store.size - MAX_ENTRIES;
  const iter = store.keys();
  for (let i = 0; i < overflow; i++) {
    const oldest = iter.next().value;
    if (oldest === undefined) break;
    store.delete(oldest);
  }
}

export type RateLimitInput = { bucket: string; identifier: string; limit: number; windowMs: number };
export type RateLimitResult = { allowed: boolean; remaining: number; retryAfterSeconds: number };

function memoryFixedWindow({ bucket, identifier, limit, windowMs }: RateLimitInput): RateLimitResult {
  const now = Date.now();
  maybePrune(now);
  evictIfNeeded();

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

  // No shared (Upstash) engine is configured.
  if (getDeploymentRuntime() === 'cloudflare') {
    // Fail CLOSED. On Cloudflare the in-isolate memory engine does not share
    // state across Workers isolates, so it cannot enforce limits at scale — an
    // unconfigured deployment must deny rather than silently admit abuse.
    logger.error('rate_limit.fail_closed_unconfigured', { bucket: input.bucket });
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil(input.windowMs / 1000)),
    };
  }

  // Local dev: permissive in-isolate fallback is acceptable (no shared attackers).
  return memoryFixedWindow(input);
}

/** Test helper: clear all windows. */
export function resetRateLimits(): void {
  store.clear();
}

/**
 * Resolve the client IP from Cloudflare's authenticated edge header.
 *
 * Do not trust X-Forwarded-For/X-Real-IP here: clients can set both headers
 * when the route is reached directly or through a non-trusted proxy, defeating
 * every per-IP limit. In local development all callers intentionally share the
 * `unknown` bucket; production traffic should pass through Cloudflare.
 */
export function getClientIp(request: Request): string {
  const cloudflare = request.headers.get('CF-Connecting-IP')?.trim();
  return cloudflare || 'unknown';
}

