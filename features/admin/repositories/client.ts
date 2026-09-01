import { getAdminSupabase } from '@/lib/supabase/admin';

export type AdminClient = ReturnType<typeof getAdminSupabase>;

/**
 * Single entry point for the admin service-role client (R-16).
 *
 * Service-role bypasses RLS, so every call site should sit behind a repository
 * in this directory where the query shape — and any ownership/scoping filters —
 * is reviewable in one spot.
 *
 * Coverage: `tests/domain/admin-repositories.test.ts` verifies the row→domain
 * mapping, error propagation, and PostgREST escaping for the migrated surfaces
 * (orders list, order detail, dashboard, cancel/change queues — 15 tests). The
 * remaining ~80 admin pages / API routes still call `getAdminSupabase()`
 * directly; migrating them is the deferred large-blast-radius pass from the
 * audit.
 */
export const getAdminClient = (() => {
  let cached: AdminClient | null = null;
  return (): AdminClient => {
    if (!cached) cached = getAdminSupabase();
    return cached;
  };
})();
