import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getOptionalServerEnv } from '@/lib/server-env';

export async function getServerSupabase() {
  const url = getOptionalServerEnv('NEXT_PUBLIC_SUPABASE_URL');
  const key = getOptionalServerEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  if (!url || !key) return null;

  const cookieStore = await cookies();
  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(values) {
        try {
          values.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Server Components cannot always write cookies; middleware handles refreshes.
        }
      },
    },
  });
}

export function createClient() {
  // Sync alias for personalization provider; defers to getServerSupabase semantics.
  // In server context, cookies() is async, so this creates a client without cookie handling
  // for non-request contexts (tests). Route handlers should use getServerSupabase() directly.
  const url = getOptionalServerEnv('NEXT_PUBLIC_SUPABASE_URL');
  const key = getOptionalServerEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  if (!url || !key) throw new Error('Missing Supabase env');
  // Use createServerClient with no-op cookies for sync provider path
  return createServerClient(url, key, {
    cookies: {
      getAll() { return []; },
      setAll() {},
    },
  });
}
