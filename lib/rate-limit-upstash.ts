import { getOptionalServerEnv } from '@/lib/server-env';
import type { RateLimitInput, RateLimitResult } from './rate-limit';

const UPSTASH_TIMEOUT_MS = 1_200;

type UpstashPipelineEntry = { result?: number | string | null; error?: string };

/** True when the Upstash Redis REST API credentials are present. */
export function isUpstashConfigured(): boolean {
  return Boolean(
    getOptionalServerEnv('UPSTASH_REDIS_REST_URL') &&
    getOptionalServerEnv('UPSTASH_REDIS_REST_TOKEN'),
  );
}

/**
 * Fixed-window counter in Upstash Redis. A single REST pipeline call keeps the
 * INCR/PEXPIRE pair adjacent: a window that outlives its TTL by milliseconds
 * can only ever extend the block, never shorten it.
 *
 * Throws on any transport/parse failure so the caller can fall back to the
 * in-isolate memory engine — fail-open per engine, never fail-open overall.
 */
export async function upstashFixedWindow(input: RateLimitInput): Promise<RateLimitResult> {
  const url = requiredUrl();
  const token = getOptionalServerEnv('UPSTASH_REDIS_REST_TOKEN');
  const key = `rl:${encodeURIComponent(input.bucket)}:${encodeURIComponent(input.identifier)}`;
  const response = await fetch(`${url}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify([
      ['INCR', key],
      ['PEXPIRE', key, String(input.windowMs)],
    ]),
    signal: AbortSignal.timeout(UPSTASH_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`upstash rate limit pipeline failed: ${response.status}`);
  const entries = (await response.json()) as UpstashPipelineEntry[];
  const count = Number(entries[0]?.result ?? NaN);
  const ttlMs = Number(entries[1]?.result ?? 0);
  if (!Number.isFinite(count)) throw new Error('upstash rate limit unreadable count');
  if (count > input.limit) {
    const safeTtlMs = Number.isFinite(ttlMs) && ttlMs > 0 ? ttlMs : input.windowMs;
    return { allowed: false, remaining: 0, retryAfterSeconds: Math.max(1, Math.ceil(safeTtlMs / 1000)) };
  }
  return { allowed: true, remaining: Math.max(0, input.limit - count), retryAfterSeconds: 0 };
}

function requiredUrl(): string {
  const value = getOptionalServerEnv('UPSTASH_REDIS_REST_URL');
  if (!value) throw new Error('Missing UPSTASH_REDIS_REST_URL');
  return value.replace(/\/+$/, '');
}
