'use server';

import { revalidatePath } from 'next/cache';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { getCurrentCustomer } from '@/features/auth/customer';
import { validateOccasion } from './validation';
import { deleteOccasion, insertOccasion, updateOccasion, upsertRecipient } from './repository';

type Customer = { id: string; email: string; displayName: string; phone: string } | null;
type Client = { from: (table: string) => any };
type ActionDeps = { customer?: Customer; client?: Client };

// Cloudflare has no middleware, so server actions cannot read locale/city
// headers. Callers pass the account base path; this is only a safe fallback.
function accountBase(path?: string): string {
  return path && path.startsWith('/') ? path : '/en';
}

async function resolveDeps(deps: ActionDeps): Promise<{ customer: Customer; client: Client }> {
  const customer = deps.customer !== undefined ? deps.customer : await getCurrentCustomer();
  const client = deps.client ?? getAdminSupabase();
  return { customer, client };
}

export async function saveOccasion(
  input: Record<string, unknown> & { accountPath?: string } & ActionDeps,
): Promise<'saved' | 'invalid' | 'unauthenticated' | 'failure'> {
  const { customer, client } = await resolveDeps(input);
  if (!customer) return 'unauthenticated';

  const parsed = validateOccasion(input);
  if (!parsed.ok) return 'invalid';

  const recipientId = await upsertRecipient(client, customer.id, parsed.value);
  if (!recipientId) return 'failure';

  const result = await insertOccasion(client, customer.id, recipientId, parsed.value);
  if (result === 'saved') revalidatePath(`${accountBase(input.accountPath)}/account/occasions`);
  return result;
}

export async function editOccasion(
  occasionId: string,
  input: Record<string, unknown> & { accountPath?: string } & ActionDeps,
): Promise<'saved' | 'invalid' | 'unauthenticated' | 'failure'> {
  const { customer, client } = await resolveDeps(input);
  if (!customer) return 'unauthenticated';

  const parsed = validateOccasion(input);
  if (!parsed.ok) return 'invalid';

  const recipientId = await upsertRecipient(client, customer.id, parsed.value);
  if (!recipientId) return 'failure';

  const result = await updateOccasion(client, customer.id, occasionId, parsed.value);
  if (result === 'saved') revalidatePath(`${accountBase(input.accountPath)}/account/occasions`);
  return result;
}

export async function removeOccasion(
  occasionId: string,
  accountPath?: string,
  deps: ActionDeps = {},
): Promise<'deleted' | 'unauthenticated' | 'failure'> {
  const { customer, client } = await resolveDeps(deps);
  if (!customer) return 'unauthenticated';

  const result = await deleteOccasion(client, customer.id, occasionId);
  if (result === 'deleted') revalidatePath(`${accountBase(accountPath)}/account/occasions`);
  return result;
}
