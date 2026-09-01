import { getAdminClient, type AdminClient } from './client';

export type AdminBundlePrice = { deliveries: number; priceMinor: number };

export type AdminPlanRow = {
  id: string;
  slug: string;
  nameEn: string;
  bundlePrices: AdminBundlePrice[];
  active: boolean;
};

export type AdminPlanDetail = {
  id: string;
  slug: string;
  nameEn: string;
  nameAr: string;
  nameFr: string;
  descriptionEn: string;
  descriptionAr: string;
  descriptionFr: string;
  frequencies: string[];
  bundlePrices: AdminBundlePrice[];
  productId: string | null;
  active: boolean;
  sortOrder: number;
};

function toBundlePrices(value: unknown): AdminBundlePrice[] {
  if (!Array.isArray(value)) return [];
  return (value as Array<Record<string, unknown>>).map((entry) => ({
    deliveries: Number(entry.deliveries ?? 0),
    priceMinor: Number(entry.priceMinor ?? 0),
  }));
}

function str(value: unknown): string {
  return value == null ? '' : String(value);
}

export async function listAdminPlans(client: AdminClient = getAdminClient()): Promise<AdminPlanRow[]> {
  const { data } = await client.from('subscription_plans').select('*').order('sort_order', { ascending: true });
  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    id: str(row.id),
    slug: str(row.slug),
    nameEn: str(row.name_en),
    bundlePrices: toBundlePrices(row.bundle_prices),
    active: row.active !== false,
  }));
}

export async function getAdminPlan(
  planId: string,
  client: AdminClient = getAdminClient(),
): Promise<AdminPlanDetail | null> {
  const { data } = await client.from('subscription_plans').select('*').eq('id', planId).maybeSingle();
  if (!data) return null;
  const row = data as Record<string, unknown>;
  return {
    id: str(row.id),
    slug: str(row.slug),
    nameEn: str(row.name_en),
    nameAr: str(row.name_ar),
    nameFr: str(row.name_fr),
    descriptionEn: str(row.description_en),
    descriptionAr: str(row.description_ar),
    descriptionFr: str(row.description_fr),
    frequencies: Array.isArray(row.frequencies) ? row.frequencies.map((entry) => String(entry)) : [],
    bundlePrices: toBundlePrices(row.bundle_prices),
    productId: row.product_id ? str(row.product_id) : null,
    active: row.active !== false,
    sortOrder: Number(row.sort_order ?? 0),
  };
}
