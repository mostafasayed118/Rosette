import { revalidatePath } from 'next/cache';
import { setEngagementPreference } from '@/features/email-preferences/preferences-service';

export type Customer = { id: string; email: string; displayName: string; phone: string };
type Client = { from: (table: string) => any };

// Cloudflare has no middleware, so server actions cannot read locale/city
// headers. Callers pass the account base path; this is only a safe fallback.
function accountBase(path?: string): string {
  return path && path.startsWith('/') ? path : '/en';
}

// Testable internals: identity and the database client are supplied explicitly
// by features/account/actions.ts, which derives them solely from
// getCurrentCustomer()/getAdminSupabase(). Never expose these as 'use server'
// exports — every export of a server action module is remotely callable.
export async function setEmailEngagementPreferenceFor(
  customer: Customer,
  client: Client,
  enabled: boolean,
  accountPath?: string,
): Promise<'saved' | 'unauthenticated' | 'failure'> {
  if (typeof enabled !== 'boolean') return 'failure';
  const result = await setEngagementPreference(client, customer.email, enabled);
  if (result === 'saved') revalidatePath(accountBase(accountPath));
  return result;
}
