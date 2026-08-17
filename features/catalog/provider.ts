import { getOptionalServerEnv } from '@/lib/server-env';
import { localCatalogRepository } from './repository';
import { supabaseCatalogRepository } from './supabase-repository';
import type { CatalogRepository } from './types';

export function getCatalogRepository(): CatalogRepository {
  const url = getOptionalServerEnv('NEXT_PUBLIC_SUPABASE_URL');
  const key = getOptionalServerEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  return url && key ? supabaseCatalogRepository : localCatalogRepository;
}
