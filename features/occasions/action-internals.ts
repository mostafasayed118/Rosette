import { revalidatePath } from 'next/cache';
import { validateOccasion } from './validation';
import { deleteOccasion, insertOccasion, updateOccasion, upsertRecipient } from './repository';

export type Customer = { id: string; email: string; displayName: string; phone: string };
type Client = { from: (table: string) => any };

// Cloudflare has no middleware, so server actions cannot read locale/city
// headers. Callers pass the account base path; this is only a safe fallback.
function accountBase(path?: string): string {
  return path && path.startsWith('/') ? path : '/en';
}

// Testable internals: identity and the database client are supplied explicitly
// by features/occasions/actions.ts, which derives them solely from
// getCurrentCustomer()/getAdminSupabase(). Never expose these as 'use server'
// exports — every export of a server action module is remotely callable.
export async function saveOccasionFor(
  customer: Customer,
  client: Client,
  input: Record<string, unknown> & { accountPath?: string },
): Promise<'saved' | 'invalid' | 'unauthenticated' | 'failure'> {
  const parsed = validateOccasion(input);
  if (!parsed.ok) return 'invalid';

  const recipientId = await upsertRecipient(client, customer.id, parsed.value);
  if (!recipientId) return 'failure';

  const result = await insertOccasion(client, customer.id, recipientId, parsed.value);
  if (result === 'saved') revalidatePath(`${accountBase(input.accountPath)}/account/occasions`);
  return result;
}

export async function editOccasionFor(
  customer: Customer,
  client: Client,
  occasionId: string,
  input: Record<string, unknown> & { accountPath?: string },
): Promise<'saved' | 'invalid' | 'unauthenticated' | 'failure'> {
  const parsed = validateOccasion(input);
  if (!parsed.ok) return 'invalid';

  const recipientId = await upsertRecipient(client, customer.id, parsed.value);
  if (!recipientId) return 'failure';

  const result = await updateOccasion(client, customer.id, occasionId, parsed.value);
  if (result === 'saved') revalidatePath(`${accountBase(input.accountPath)}/account/occasions`);
  return result;
}

export async function removeOccasionFor(
  customer: Customer,
  client: Client,
  occasionId: string,
  accountPath?: string,
): Promise<'deleted' | 'unauthenticated' | 'failure'> {
  const result = await deleteOccasion(client, customer.id, occasionId);
  if (result === 'deleted') revalidatePath(`${accountBase(accountPath)}/account/occasions`);
  return result;
}
