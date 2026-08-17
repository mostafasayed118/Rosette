import { createBrowserClient } from '@supabase/ssr';
import { getOptionalServerEnv } from '@/lib/server-env';

export function getBrowserSupabase() {
  const url = getOptionalServerEnv('NEXT_PUBLIC_SUPABASE_URL');
  const key = getOptionalServerEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  if (!url || !key) return null;
  return createBrowserClient(url, key);
}
