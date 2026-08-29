/**
 * Model registry with automatic fallback chain.
 *
 * Models are tried in order; the first successful response is returned.
 * The primary model is configurable via the GROQ_MODEL env var.
 * Fallbacks are hardcoded stable Production-tier models on Groq's free plan.
 *
 * Last verified: 2026-08-28 — https://console.groq.com/docs/models
 */

import { getOptionalServerEnv } from '@/lib/server-env';

/**
 * Stable free-tier models available on Groq (Production / long-lived).
 * Ordered by quality: 70B versatile > 8B instant > compound-mini.
 */
const FALLBACK_MODELS = [
  'llama-3.3-70b-versatile',
  'llama-3.1-8b-instant',
  'groq/compound-mini',
] as const;

const DEFAULT_PRIMARY = 'qwen/qwen3.8-27b';

/**
 * Build the ordered list of models to try.
 *  1. User-configured GROQ_MODEL (or default primary)
 *  2. Stable free fallbacks (deduplicated against #1)
 */
export function getModelChain(): readonly string[] {
  const primary = getOptionalServerEnv('GROQ_MODEL') ?? DEFAULT_PRIMARY;
  const seen = new Set<string>([primary]);
  const chain: string[] = [primary];

  for (const fb of FALLBACK_MODELS) {
    if (!seen.has(fb)) {
      seen.add(fb);
      chain.push(fb);
    }
  }

  return chain;
}
