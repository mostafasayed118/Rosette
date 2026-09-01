import type { PromoInput } from '../promo-actions';
import { getAdminClient, type AdminClient } from './client';

/**
 * Reuse the write-side `PromoInput` shape so the list page can hand a row
 * straight back to the edit form without re-declaring the fields.
 */
export type AdminPromoRow = PromoInput & { usedCount: number };

export async function listAdminPromos(client: AdminClient = getAdminClient()): Promise<AdminPromoRow[]> {
  const { data } = await client.from('promo_codes').select('*').order('created_at', { ascending: false });
  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    code: String(row.code ?? ''),
    type: (row.type === 'fixed' || row.type === 'free_shipping' ? row.type : 'percent') as PromoInput['type'],
    percentOff: row.percent_off == null ? null : Number(row.percent_off),
    valueMinor: row.value_minor == null ? null : Number(row.value_minor),
    minimumOrderMinor: Number(row.minimum_order_minor ?? 0),
    startsAt: row.starts_at == null ? null : String(row.starts_at),
    expiresAt: row.expires_at == null ? null : String(row.expires_at),
    maxUses: Number(row.max_uses ?? 0),
    perUserLimit: Number(row.per_user_limit ?? 0),
    active: Boolean(row.active),
    usedCount: Number(row.used_count ?? 0),
  }));
}
