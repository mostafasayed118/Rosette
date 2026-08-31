import type { Plan } from './types';

type Client = { from: (table: string) => any };
function mapPlan(row: any): Plan {
  return {
    id: String(row.id), slug: String(row.slug),
    nameEn: String(row.name_en ?? ''), nameAr: String(row.name_ar ?? ''), nameFr: String(row.name_fr ?? ''),
    descriptionEn: String(row.description_en ?? ''), descriptionAr: String(row.description_ar ?? ''), descriptionFr: String(row.description_fr ?? ''),
    frequencies: (row.frequencies ?? []) as Plan['frequencies'],
    bundlePrices: row.bundle_prices ?? [],
    productId: row.product_id ? String(row.product_id) : '',
    active: row.active !== false,
    sortOrder: Number(row.sort_order ?? 0),
  };
}
export async function getActivePlans(client: Client): Promise<Plan[]> {
  const { data, error } = await client.from('subscription_plans').select('*').eq('active', true).order('sort_order', { ascending: true });
  return error || !data ? [] : ((data as Array<Record<string, unknown>>) ?? []).map(mapPlan);
}
export async function getPlanBySlug(client: Client, slug: string): Promise<Plan | null> {
  const { data, error } = await client.from('subscription_plans').select('*').eq('slug', slug).maybeSingle();
  return error || !data ? null : mapPlan(data);
}
