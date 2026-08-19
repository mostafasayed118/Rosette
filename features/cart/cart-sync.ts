import { randomUUID } from 'node:crypto';
import { validateCartLines } from './cart-lines';
import type { CartLine } from './types';

type CartClient = { from: (table: string) => any };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type UpsertCartResult = { status: 'ok'; restoreToken: string } | { status: 'invalid' } | { status: 'failure' };

export async function upsertCart(
  client: CartClient,
  input: { email: string; customerId?: string | null; locale: 'en' | 'ar' | 'fr'; city: string; lines: CartLine[] },
): Promise<UpsertCartResult> {
  const email = input.email.trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return { status: 'invalid' };
  try {
    if (Array.isArray(input.lines) && input.lines.length === 0) {
      const { error } = await client.from('carts').delete().eq('email', email).is('converted_at', null);
      return error ? { status: 'failure' } : { status: 'ok', restoreToken: '' };
    }
    const lines = validateCartLines(input.lines);
    if (!lines) return { status: 'invalid' };
    const restoreToken = randomUUID();
    const row = { email, customer_id: input.customerId ?? null, locale: input.locale, city: input.city, lines, restore_token: restoreToken, updated_at: new Date().toISOString() };
    const { data: existing } = await client.from('carts').select('id').eq('email', email).is('converted_at', null).maybeSingle();
    if (existing) {
      const { error } = await client.from('carts').update(row).eq('id', (existing as { id: string }).id);
      if (error) return { status: 'failure' };
    } else {
      const { error } = await client.from('carts').insert(row);
      if (error) return { status: 'failure' };
    }
    return { status: 'ok', restoreToken };
  } catch {
    return { status: 'failure' };
  }
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
