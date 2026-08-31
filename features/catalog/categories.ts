import { unstable_cache } from 'next/cache';
import { createClient } from '@supabase/supabase-js';
import { categories as fallbackCategories } from './data';
import { getOptionalServerEnv } from '@/lib/server-env';

export type CatalogCategory = { slug: string; nameEn: string; nameAr: string; nameFr: string };

/**
 * Read the category taxonomy that already exists in Supabase, with the local
 * catalog list as the demo/no-provider fallback. This keeps the admin-managed
 * taxonomy and the storefront filters in sync without making the local demo
 * depend on a database.
 *
 * Cached for an hour (R-08); any admin action that mutates categories must call
 * `revalidateTag('categories')` to invalidate this entry.
 */
export const listCatalogCategories = unstable_cache(
  async (): Promise<CatalogCategory[]> => {
  const fallback = fallbackCategories
    .filter((slug) => slug !== 'all')
    .map((slug) => ({ slug, nameEn: slug, nameAr: slug, nameFr: slug }));
  const url = getOptionalServerEnv('NEXT_PUBLIC_SUPABASE_URL');
  const key = getOptionalServerEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  if (!url || !key) return fallback;
  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase
    .from('categories')
    .select('slug,name_en,name_ar,name_fr')
    .eq('active', true)
    .order('name_en');
  if (error || !data?.length) return fallback;
  return (data as Array<{ slug: string; name_en: string; name_ar: string; name_fr: string | null }>).map((row) => ({
    slug: row.slug,
    nameEn: row.name_en,
    nameAr: row.name_ar,
    nameFr: row.name_fr ?? row.name_en,
  }));
  },
  ['catalog-categories'],
  { revalidate: 3600, tags: ['categories'] },
);
