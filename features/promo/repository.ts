import type { PromoRow } from './apply';

type PromoClient = { from: (table: string) => any };

export async function fetchPromo(client: PromoClient, code: string): Promise<PromoRow | null> {
  const { data, error } = await client.from('promo_codes').select('*').eq('code', code.trim().toUpperCase()).maybeSingle();
  if (error || !data) return null;
  return data as PromoRow;
}
