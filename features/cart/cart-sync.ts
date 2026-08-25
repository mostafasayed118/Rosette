import { randomUUID } from 'node:crypto';
import { validateCartLines } from './cart-lines';
import type { CartLine } from './types';

type CartClient = { from: (table: string) => any; rpc?: (name: string, args: Record<string, unknown>) => unknown };

function unwrapRpc(result: unknown): { error: { message: string } | null } {
  if (result && typeof result === 'object' && 'error' in result) {
    return result as { error: { message: string } | null };
  }
  return { error: null };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type UpsertCartResult = { status: 'ok'; restoreToken: string } | { status: 'invalid' } | { status: 'failure' };

export async function upsertCart(
  client: CartClient,
  input: { email: string; customerId?: string | null; locale: 'en' | 'ar' | 'fr'; city: string; lines: CartLine[] },
): Promise<UpsertCartResult> {
  const email = input.email.trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return { status: 'invalid' };
  // The DB path enforces the customer-scope branch (signed-in vs guest) and
  // atomicity. The JS path validates shape and email so the RPC receives a
  // well-formed jsonb; the RPC is security definer and is the only writer.
  if (Array.isArray(input.lines) && input.lines.length === 0) {
    if (!client.rpc) return { status: 'failure' };
    const { error } = unwrapRpc(await client.rpc('upsert_cart', { p_email: email, p_customer_id: input.customerId ?? null, p_locale: input.locale, p_city: input.city, p_lines: [], p_restore_token: '' }));
    return error ? { status: 'failure' } : { status: 'ok', restoreToken: '' };
  }
  const lines = validateCartLines(input.lines);
  if (!lines) return { status: 'invalid' };
  const restoreToken = randomUUID();
  if (!client.rpc) return { status: 'failure' };
  const { error } = unwrapRpc(await client.rpc('upsert_cart', { p_email: email, p_customer_id: input.customerId ?? null, p_locale: input.locale, p_city: input.city, p_lines: lines, p_restore_token: restoreToken }));
  return error ? { status: 'failure' } : { status: 'ok', restoreToken };
}

export type MarkConvertedResult = { status: 'ok' } | { status: 'failure' };

export async function markCartConverted(client: CartClient, input: { email: string }): Promise<MarkConvertedResult> {
  const email = input.email.trim().toLowerCase();
  if (!email) return { status: 'ok' };
  try {
    const { error } = await client.from('carts').update({ converted_at: new Date().toISOString() }).eq('email', email).is('converted_at', null);
    return error ? { status: 'failure' } : { status: 'ok' };
  } catch {
    return { status: 'failure' };
  }
}

export type RestoreCartResult = { status: 'ok'; lines: CartLine[] } | { status: 'not_found' } | { status: 'failure' };

export async function getCartByRestoreToken(client: CartClient, input: { token: string }): Promise<RestoreCartResult> {
  if (!input.token) return { status: 'not_found' };
  try {
    const { data } = await client.from('carts').select('lines').eq('restore_token', input.token).maybeSingle();
    if (!data) return { status: 'not_found' };
    const lines = validateCartLines((data as { lines: unknown }).lines);
    if (!lines) return { status: 'not_found' };
    return { status: 'ok', lines };
  } catch {
    return { status: 'failure' };
  }
}
