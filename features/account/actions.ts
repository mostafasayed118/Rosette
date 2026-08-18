'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getServerSupabase } from '@/lib/supabase/server';
import { getCurrentCustomer } from '@/features/auth/customer';
import { resolveServerPath } from '@/features/i18n/server-locale';
import { validateProfile, updateProfileRecord } from './profile';

async function accountBase(): Promise<string> {
  const { locale, city } = await resolveServerPath();
  return city ? `/${locale}/${city}/account` : '/account';
}

export async function updateProfile(input: { displayName: string; phone: string }): Promise<'saved' | 'invalid_name' | 'invalid_phone' | 'unauthenticated' | 'failure'> {
  const customer = await getCurrentCustomer();
  if (!customer) return 'unauthenticated';
  const invalid = validateProfile(input);
  if (invalid) return invalid;
  const supabase = await getServerSupabase();
  if (!supabase) return 'failure';
  const result = await updateProfileRecord(supabase, customer.id, input);
  if (result === 'saved') revalidatePath(await accountBase());
  return result;
}

export async function signOutCustomer() {
  const supabase = await getServerSupabase();
  if (supabase) await supabase.auth.signOut();
  redirect(`${await accountBase()}/login`);
}
