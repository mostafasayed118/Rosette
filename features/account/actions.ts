'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getServerSupabase } from '@/lib/supabase/server';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { getCurrentCustomer } from '@/features/auth/customer';
import { setEmailEngagementPreferenceFor } from './action-internals';
import { validateProfile, updateProfileRecord } from './profile';

// Cloudflare has no middleware, so server actions can no longer read the
// locale/city request headers. Storefront callers pass the account base path
// explicitly; this default is only a safe fallback for non-storefront usage.
function accountBase(path?: string): string {
  return path && path.startsWith('/') ? path : '/en';
}

export async function updateProfile(input: { displayName: string; phone: string; accountPath?: string }): Promise<'saved' | 'invalid_name' | 'invalid_phone' | 'unauthenticated' | 'failure'> {
  const customer = await getCurrentCustomer();
  if (!customer) return 'unauthenticated';
  const invalid = validateProfile(input);
  if (invalid) return invalid;
  const supabase = await getServerSupabase();
  if (!supabase) return 'failure';
  const result = await updateProfileRecord(supabase, customer.id, input);
  if (result === 'saved') revalidatePath(accountBase(input.accountPath));
  return result;
}

export async function setEmailEngagementPreference(enabled: boolean, accountPath?: string): Promise<'saved' | 'unauthenticated' | 'failure'> {
  if (typeof enabled !== 'boolean') return 'failure';
  const customer = await getCurrentCustomer();
  if (!customer) return 'unauthenticated';
  let client;
  try { client = getAdminSupabase(); } catch { return 'failure'; }
  // Identity is resolved ONLY from the authenticated session. The injectable
  // customer/client variant lives in action-internals.ts (tests only); accepting
  // it here would let a remote caller impersonate another customer.
  return setEmailEngagementPreferenceFor(customer, client, enabled, accountPath);
}

export async function signOutCustomer(formData?: FormData) {
  const supabase = await getServerSupabase();
  if (supabase) await supabase.auth.signOut();
  const path = formData?.get('accountPath');
  redirect(`${accountBase(typeof path === 'string' ? path : undefined)}/login`);
}
