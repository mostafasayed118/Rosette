import { getOptionalServerEnv } from '@/lib/server-env';
import { selectDataSource } from '@/features/commerce/provider-selection';
import { localCatalogRepository } from './local-repository';
import { supabaseCatalogRepository } from './supabase-repository';
import type { CatalogRepository } from './types';

export function getCatalogRepository(): CatalogRepository {
  const url = getOptionalServerEnv('NEXT_PUBLIC_SUPABASE_URL');
  const key = getOptionalServerEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  return selectDataSource({ url, key }) === 'supabase' ? supabaseCatalogRepository : localCatalogRepository;
}
