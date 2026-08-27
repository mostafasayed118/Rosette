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
          // Server Components cannot always write cookies. There is no
          // middleware/proxy in this deployment: the browser client refreshes
          // the session cookie asynchronously while the tab is open, and
          // cookie-writable contexts (Server Actions, route handlers) rotate
          // it on auth changes.
        }
      },
    },
  });
}

export async function createClient() {
  const url = getOptionalServerEnv('NEXT_PUBLIC_SUPABASE_URL');
  const key = getOptionalServerEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  if (!url || !key) throw new Error('Missing Supabase env');
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
          // See getServerSupabase: refreshes come from the browser client and
          // cookie-writable contexts, not from middleware.
        }
      },
    },
  });
}

