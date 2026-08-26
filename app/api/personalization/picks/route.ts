import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { getPersonalizationProvider } from '@/features/personalization/provider';
import { logger } from '@/lib/logger';

const schema = z.object({
  limit: z.coerce.number().int().min(1).max(12).default(8),
  excludeSlug: z.string().max(80).optional(),
  locale: z.enum(['en', 'ar', 'fr']).default('en'),
});

export async function GET(req: Request) {
  if (process.env.ROSETTE_PERSONALIZATION_ENABLED === 'false') {
    return NextResponse.json({ buyAgain: [], recommended: [], reason: 'fallback' });
  }

  const url = new URL(req.url);
  const parsed = schema.safeParse({
    limit: url.searchParams.get('limit') ?? undefined,
    excludeSlug: url.searchParams.get('excludeSlug') ?? undefined,
    locale: url.searchParams.get('locale') ?? 'en',
  });

  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_query' }, { status: 400 });
  }

  const supabase = createClient();
  const { data: { user } } = await (supabase as any).auth.getUser();

  if (!user) {
    return NextResponse.json(
      { buyAgain: [], recommended: [], reason: 'fallback' },
      { status: 401, headers: { 'Cache-Control': 'private, max-age=0' } },
    );
  }

  try {
    const provider = getPersonalizationProvider();
    const picks = await provider.getPicks(user.id, parsed.data);
    const etag = `W/"${user.id}:${parsed.data.limit}:${parsed.data.excludeSlug ?? ''}"`;
    logger.info('personalization.picks.served', {
      customerId: user.id,
      buyAgainCount: picks.buyAgain.length,
      recommendedCount: picks.recommended.length,
      reason: picks.reason,
    });
    return NextResponse.json(picks, {
      headers: { 'Cache-Control': 'private, max-age=60', ETag: etag },
    });
  } catch (e) {
    logger.error('personalization.picks.failed', { error: String(e) });
    const provider = getPersonalizationProvider();
    const fallback = await provider
      .getPicks(user.id, parsed.data)
      .catch(() => ({ buyAgain: [], recommended: [], reason: 'fallback' as const }));
    return NextResponse.json(fallback);
  }
}
