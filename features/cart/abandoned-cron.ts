import { getRequiredServerEnv } from '@/lib/server-env';
import { buildUnsubscribeUrl, getEngagementPreference, type EngagementPreference } from '@/features/email-preferences/preferences-service';
import { sendAbandonedCartEmail } from './abandoned-email';
import type { CartLine } from './types';

type CronClient = { from: (table: string) => any };
type PreferenceLookup = (email: string) => Promise<EngagementPreference>;

export type AbandonedCartSummary = { checked: number; sent: number; failed: number; suppressed: number };
export const ABANDONED_CART_BATCH_SIZE = 500;

export async function runAbandonedCartCron(
  client: CronClient,
  deps: { origin: string; send?: typeof sendAbandonedCartEmail; now?: Date; secret?: string; getPreference?: PreferenceLookup },
): Promise<AbandonedCartSummary> {
  const send = deps.send ?? sendAbandonedCartEmail;
  const now = deps.now ?? new Date();
  const secret = deps.secret ?? getRequiredServerEnv('EMAIL_PREFERENCES_SECRET');
  const getPreference = deps.getPreference ?? ((email: string) => getEngagementPreference(client, email));
  const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const baseQuery = client.from('carts')
    .select('id,email,locale,city,lines,restore_token')
    .is('converted_at', null)
    .is('last_emailed_at', null)
    .is('engagement_suppressed_at', null)
    .lt('updated_at', cutoff);
  // The production client always supports both methods. The optional guards keep
  // the domain function compatible with its intentionally tiny test doubles.
  const orderedQuery = typeof baseQuery.order === 'function' ? baseQuery.order('updated_at', { ascending: true }) : baseQuery;
  const boundedQuery = typeof orderedQuery.limit === 'function' ? orderedQuery.limit(ABANDONED_CART_BATCH_SIZE) : orderedQuery;
  const { data } = await boundedQuery;
  const rows = (data ?? []) as Array<Record<string, any>>;
  const summary: AbandonedCartSummary = { checked: 0, sent: 0, failed: 0, suppressed: 0 };
  for (const row of rows) {
    summary.checked += 1;
    const lines = Array.isArray(row.lines) ? (row.lines as CartLine[]) : [];
    if (!lines.length) continue;
    const email = String(row.email ?? '');
    let preference: EngagementPreference;
    try {
      preference = await getPreference(email);
    } catch {
      preference = { status: 'error' };
    }
    if (preference.status === 'error') {
      summary.failed += 1;
      continue;
    }
    if (preference.status === 'disabled') {
      await client.from('carts').update({ engagement_suppressed_at: now.toISOString() }).eq('id', String(row.id));
      summary.suppressed += 1;
      continue;
    }
    const locale = row.locale === 'ar' || row.locale === 'fr' ? row.locale : 'en';
    const city = typeof row.city === 'string' && row.city.length > 0 ? row.city : 'cairo';
    const restoreUrl = `${deps.origin.replace(/\/$/, '')}/${locale}/${city}/cart?restore=${encodeURIComponent(String(row.restore_token))}`;
    try {
      const unsubscribeUrl = buildUnsubscribeUrl(deps.origin, email, secret, locale);
      await send({ to: email, locale, items: lines, restoreUrl, unsubscribeUrl });
      await client.from('carts').update({ last_emailed_at: now.toISOString() }).eq('id', String(row.id));
      summary.sent += 1;
    } catch {
      summary.failed += 1;
    }
  }
  return summary;
}
