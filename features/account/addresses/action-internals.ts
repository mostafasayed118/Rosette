import { revalidatePath } from 'next/cache';
import { validateAddressBookInput } from './types';
import { clearDefaults, deleteAddress, insertAddress, listAddresses, updateAddress } from './repository';
import type { AddressBookEntry, AddressBookInput, AddressBookResult } from './types';

type Client = { from: (table: string) => any };

// Cloudflare has no middleware, so server actions cannot read locale/city
// headers. Callers pass the account base path; this is only a safe fallback.
function accountBase(path?: string): string {
  return path && path.startsWith('/') ? path : '/en';
}

// Testable internals: identity and the database client are supplied explicitly
// by features/account/actions.ts, which derives them solely from
// getCurrentCustomer()/getAdminSupabase(). Never expose these as 'use server'
// exports - every export of a server action module is remotely callable.
export async function saveAddressFor(
  customer: { id: string },
  client: Client,
  addressId: string | null,
  input: AddressBookInput,
  accountPath?: string,
): Promise<AddressBookResult> {
  if (validateAddressBookInput(input)) return 'invalid';
  if (input.isDefault) await clearDefaults(client, customer.id, addressId ?? undefined);
  const result = addressId
    ? await updateAddress(client, customer.id, addressId, input)
    : await insertAddress(client, customer.id, input);
  if (result === 'saved') revalidatePath(`${accountBase(accountPath)}/account/addresses`);
  return result;
}

export async function removeAddressFor(
  customer: { id: string },
  client: Client,
  addressId: string,
  accountPath?: string,
): Promise<AddressBookResult> {
  const result = await deleteAddress(client, customer.id, addressId);
  if (result === 'deleted') revalidatePath(`${accountBase(accountPath)}/account/addresses`);
  return result;
}

export async function listAddressesFor(customer: { id: string }, client: Client): Promise<AddressBookEntry[]> {
  return listAddresses(client, customer.id);
}
