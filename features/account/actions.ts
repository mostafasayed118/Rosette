'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getServerSupabase } from '@/lib/supabase/server';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { getCurrentCustomer } from '@/features/auth/customer';
import { setEngagementPreference } from '@/features/email-preferences/preferences-service';
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

type PreferenceActionDeps = { customer?: { id: string; email: string; displayName: string; phone: string } | null; client?: { from: (table: string) => any } };

export async function setEmailEngagementPreference(enabled: boolean, deps?: PreferenceActionDeps): Promise<'saved' | 'unauthenticated' | 'failure'> {
  if (typeof enabled !== 'boolean') return 'failure';
  const customer = deps && 'customer' in deps ? deps.customer : await getCurrentCustomer();
  if (!customer) return 'unauthenticated';
  let client = deps?.client;
  if (!client) {
    try { client = getAdminSupabase(); } catch { return 'failure'; }
  }
  const result = await setEngagementPreference(client, customer.email, enabled);
  if (result === 'saved' && !deps) revalidatePath(await accountBase());
  return result;
}

export async function signOutCustomer() {
  const supabase = await getServerSupabase();
  if (supabase) await supabase.auth.signOut();
  redirect(`${await accountBase()}/login`);
}
