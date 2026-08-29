import type { AddressBookEntry, AddressBookInput } from './types';

type Client = { from: (table: string) => any };

function rowToEntry(row: any): AddressBookEntry {
  return {
    id: String(row.id),
    label: row.label ?? '',
    recipientName: row.recipient_name ?? '',
    recipientPhone: row.recipient_phone ?? '',
    address: row.address ?? '',
    citySlug: row.city_slug ?? '',
    isDefault: Boolean(row.is_default),
  };
}

function entryToColumns(customerId: string, input: AddressBookInput) {
  return {
    customer_id: customerId,
    label: input.label.trim(),
    recipient_name: input.recipientName.trim(),
    recipient_phone: input.recipientPhone.trim(),
    address: input.address.trim(),
    city_slug: input.citySlug.trim(),
    is_default: Boolean(input.isDefault),
  };
}

export async function listAddresses(client: Client, customerId: string): Promise<AddressBookEntry[]> {
  const { data, error } = await client
    .from('address_book')
    .select('id,label,recipient_name,recipient_phone,address,city_slug,is_default')
    .eq('customer_id', customerId)
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: true });
  if (error) return [];
  return (data ?? []).map(rowToEntry);
}

export async function insertAddress(client: Client, customerId: string, input: AddressBookInput): Promise<'saved' | 'failure'> {
  const { error } = await client.from('address_book').insert(entryToColumns(customerId, input));
  return error ? 'failure' : 'saved';
}

export async function updateAddress(client: Client, customerId: string, addressId: string, input: AddressBookInput): Promise<'saved' | 'failure'> {
  const { error } = await client
    .from('address_book')
    .update(entryToColumns(customerId, input))
    .eq('id', addressId)
    .eq('customer_id', customerId);
  return error ? 'failure' : 'saved';
}

export async function deleteAddress(client: Client, customerId: string, addressId: string): Promise<'deleted' | 'failure'> {
  const { error } = await client
    .from('address_book')
    .delete()
    .eq('id', addressId)
    .eq('customer_id', customerId);
  return error ? 'failure' : 'deleted';
}

/** Demote every other default before promoting one entry to default. */
export async function clearDefaults(client: Client, customerId: string, exceptAddressId?: string) {
  let query = client.from('address_book').update({ is_default: false }).eq('customer_id', customerId).eq('is_default', true);
  if (exceptAddressId) query = query.neq('id', exceptAddressId);
  await query;
}
