'use server';

import { getAdminSupabase } from '@/lib/supabase/admin';
import { getCurrentCustomer } from '@/features/auth/customer';
import { removeAddressFor, saveAddressFor } from './action-internals';
import type { AddressBookInput, AddressBookResult } from './types';

// Identity is resolved ONLY from the authenticated session. The injectable
// customer/client variants live in action-internals.ts (tests only); accepting
// them here would let a remote caller impersonate another customer
// (see GitHub issue #2 for the identical setEmailEngagementPreference bug).
export async function saveAddress(
  addressId: string | null,
  input: AddressBookInput,
  accountPath?: string,
): Promise<AddressBookResult> {
  const customer = await getCurrentCustomer();
  if (!customer) return 'unauthenticated';
  return saveAddressFor(customer, getAdminSupabase(), addressId, input, accountPath);
}

export async function removeAddress(
  addressId: string,
  accountPath?: string,
): Promise<AddressBookResult> {
  const customer = await getCurrentCustomer();
  if (!customer) return 'unauthenticated';
  return removeAddressFor(customer, getAdminSupabase(), addressId, accountPath);
}
