import { sendAbandonedCartEmail } from './abandoned-email';
import type { CartLine } from './types';

type CronClient = { from: (table: string) => any };

export type AbandonedCartSummary = { checked: number; sent: number; failed: number };

export async function runAbandonedCartCron(
  client: CronClient,
  deps: { origin: string; send?: typeof sendAbandonedCartEmail; now?: Date },
): Promise<AbandonedCartSummary> {
  const send = deps.send ?? sendAbandonedCartEmail;
  const now = deps.now ?? new Date();
  const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const { data } = await client.from('carts')
    .select('id,email,locale,city,lines,restore_token')
    .is('converted_at', null)
    .is('last_emailed_at', null)
    .lt('updated_at', cutoff);
  const rows = (data ?? []) as Array<Record<string, any>>;
  const summary: AbandonedCartSummary = { checked: 0, sent: 0, failed: 0 };
  for (const row of rows) {
    summary.checked += 1;
    const lines = Array.isArray(row.lines) ? (row.lines as CartLine[]) : [];
    if (!lines.length) continue;
    const locale = row.locale === 'ar' || row.locale === 'fr' ? row.locale : 'en';
    const city = typeof row.city === 'string' && row.city.length > 0 ? row.city : 'cairo';
    const restoreUrl = `${deps.origin.replace(/\/$/, '')}/${locale}/${city}/cart?restore=${encodeURIComponent(String(row.restore_token))}`;
    try {
      await send({ to: String(row.email), locale, items: lines, restoreUrl });
      await client.from('carts').update({ last_emailed_at: now.toISOString() }).eq('id', String(row.id));
      summary.sent += 1;
    } catch {
      summary.failed += 1;
    }
  }
  return summary;
}
