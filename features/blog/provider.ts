import { getOptionalServerEnv } from '@/lib/server-env';
import { selectDataSource } from '@/features/commerce/provider-selection';
import { localBlogRepository } from './local-repository';
import { supabaseBlogRepository } from './supabase-repository';
import type { BlogRepository } from './types';

export function getBlogRepository(): BlogRepository {
  const url = getOptionalServerEnv('NEXT_PUBLIC_SUPABASE_URL');
  const key = getOptionalServerEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  return selectDataSource({ url, key }) === 'supabase' ? supabaseBlogRepository : localBlogRepository;
}
