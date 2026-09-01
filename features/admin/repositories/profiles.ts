import { getAdminClient, type AdminClient } from './client';

/**
 * Resolve `profiles.id` → display name for the audit/reviewer columns shown on
 * the review, change-request and cancel-request queues. Falls back to the raw
 * id when a profile row is missing so the UI never renders an empty cell.
 */
export async function mapReviewerNames(
  ids: Array<string | null | undefined>,
  client: AdminClient = getAdminClient(),
): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((value): value is string => Boolean(value)))];
  if (unique.length === 0) return new Map();
  const { data } = await client.from('profiles').select('id,display_name').in('id', unique);
  return new Map(
    ((data ?? []) as Array<{ id: string; display_name: string | null }>).map((profile) => [
      String(profile.id),
      String(profile.display_name ?? profile.id),
    ]),
  );
}
