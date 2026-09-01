import { NextResponse } from 'next/server';
import { ANALYTICS_EVENTS, type AnalyticsEventName } from '@/features/analytics/events';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { enforceRateLimit, RATE_LIMITS } from '@/lib/rate-limit-guard';
import { logger } from '@/lib/logger';

const MAX_PATH_LENGTH = 240;
const MAX_PRODUCT_SLUG_LENGTH = 120;
const MAX_METADATA_KEYS = 12;

function isEvent(value: unknown): value is AnalyticsEventName {
  return typeof value === 'string' && (ANALYTICS_EVENTS as readonly string[]).includes(value);
}

function cleanMetadata(value: unknown): Record<string, string | number | boolean | null> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const result: Record<string, string | number | boolean | null> = {};
  for (const [key, raw] of Object.entries(value).slice(0, MAX_METADATA_KEYS)) {
    if (!/^[a-zA-Z][a-zA-Z0-9_]{0,40}$/.test(key)) continue;
    if (raw === null || typeof raw === 'boolean' || typeof raw === 'number' && Number.isFinite(raw)) {
      result[key] = raw;
    } else if (typeof raw === 'string') {
      result[key] = raw.slice(0, 160);
    }
  }
  return result;
}

export async function POST(request: Request) {
  const limited = await enforceRateLimit(request, RATE_LIMITS.analytics);
  if (limited) return limited;
  try {
    const body = await request.json() as Record<string, unknown>;
    if (!isEvent(body.event)) return NextResponse.json({ ok: false }, { status: 400 });
    const locale = body.locale === 'ar' || body.locale === 'fr' || body.locale === 'en' ? body.locale : 'en';
    const path = typeof body.path === 'string' ? body.path.slice(0, MAX_PATH_LENGTH) : '';
    const productSlug = typeof body.productSlug === 'string' ? body.productSlug.slice(0, MAX_PRODUCT_SLUG_LENGTH) : null;
    const metadata = cleanMetadata(body.metadata);
    const client = getAdminSupabase();
    const { error } = await client.from('analytics_events').insert({
      event_name: body.event,
      path,
      locale,
      product_slug: productSlug,
      metadata,
    });
    if (error) {
      logger.warn('analytics.event_write_failed', { event: body.event, error: error.message });
      return NextResponse.json({ ok: false }, { status: 503 });
    }
    return NextResponse.json({ ok: true }, { status: 202 });
  } catch (error) {
    logger.warn('analytics.event_rejected', { error });
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}
