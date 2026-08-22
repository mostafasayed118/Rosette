'use server';

import { getAdminSupabase } from '@/lib/supabase/admin';
import { getCurrentCustomer } from '@/features/auth/customer';
import { editOccasionFor, removeOccasionFor, saveOccasionFor } from './action-internals';

// Identity is resolved ONLY from the authenticated session. The injectable
// customer/client variants live in action-internals.ts (tests only); accepting
// them here would let a remote caller impersonate another customer.
export async function saveOccasion(
  input: Record<string, unknown> & { accountPath?: string },
): Promise<'saved' | 'invalid' | 'unauthenticated' | 'failure'> {
  const customer = await getCurrentCustomer();
  if (!customer) return 'unauthenticated';
  return saveOccasionFor(customer, getAdminSupabase(), input);
}

export async function editOccasion(
  occasionId: string,
  input: Record<string, unknown> & { accountPath?: string },
): Promise<'saved' | 'invalid' | 'unauthenticated' | 'failure'> {
  const customer = await getCurrentCustomer();
  if (!customer) return 'unauthenticated';
  return editOccasionFor(customer, getAdminSupabase(), occasionId, input);
}

export async function removeOccasion(
  occasionId: string,
  accountPath?: string,
): Promise<'deleted' | 'unauthenticated' | 'failure'> {
  const customer = await getCurrentCustomer();
  if (!customer) return 'unauthenticated';
  return removeOccasionFor(customer, getAdminSupabase(), occasionId, accountPath);
}
