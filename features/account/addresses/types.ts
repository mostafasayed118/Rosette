export type AddressBookEntry = {
  id: string;
  label: string;
  recipientName: string;
  recipientPhone: string;
  address: string;
  citySlug: string;
  isDefault: boolean;
};

export type AddressBookInput = Omit<AddressBookEntry, 'id' | 'isDefault'> & { isDefault?: boolean };

export type AddressBookResult = 'saved' | 'deleted' | 'invalid' | 'unauthenticated' | 'failure';

const LABEL_MAX = 50;
const NAME_MAX = 80;
const PHONE_MAX = 50;
const ADDRESS_MAX = 300;

export function validateAddressBookInput(input: AddressBookInput): 'invalid' | null {
  if (!input.label.trim() || input.label.trim().length > LABEL_MAX) return 'invalid';
  if (!input.recipientName.trim() || input.recipientName.trim().length > NAME_MAX) return 'invalid';
  if (!input.recipientPhone.trim() || input.recipientPhone.trim().length > PHONE_MAX) return 'invalid';
  if (!input.address.trim() || input.address.trim().length > ADDRESS_MAX) return 'invalid';
  if (!input.citySlug.trim()) return 'invalid';
  return null;
}
