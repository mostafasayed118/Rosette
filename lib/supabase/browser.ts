import { createBrowserClient } from '@supabase/ssr';

export function getBrowserSupabase() {
  // Static access so Next.js inlines NEXT_PUBLIC_* vars into the client bundle.
  // Dynamic process.env[key] lookups are not inlined and return undefined in the browser.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createBrowserClient(url, key);
}
