import { getAdminClient, type AdminClient } from './client';

export type AdminCityRule = {
  feeMinor: number;
  minimumOrderMinor: number;
  cutoffHour: number;
  active: boolean;
};

export type AdminCityRow = {
  code: string;
  nameEn: string;
  nameAr: string;
  sameDay: boolean;
  rule: AdminCityRule | null;
};

export async function listAdminCities(client: AdminClient = getAdminClient()): Promise<AdminCityRow[]> {
  const { data } = await client.from('cities').select('code,name_en,name_ar,same_day,delivery_rules(*)').order('code');
  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => {
    const rawRules = Array.isArray(row.delivery_rules) ? (row.delivery_rules as Array<Record<string, unknown>>) : [];
    const raw = rawRules[0];
    return {
      code: String(row.code ?? ''),
      nameEn: String(row.name_en ?? ''),
      nameAr: String(row.name_ar ?? ''),
      sameDay: Boolean(row.same_day),
      rule: raw
        ? {
            feeMinor: Number(raw.fee_minor ?? 0),
            minimumOrderMinor: Number(raw.minimum_order_minor ?? 0),
            cutoffHour: Number(raw.cutoff_hour ?? 14),
            active: Boolean(raw.active),
          }
        : null,
    };
  });
}
