import { getServerSupabase } from '@/lib/supabase/server';

type SupabaseLike = NonNullable<Awaited<ReturnType<typeof getServerSupabase>>>;

export type CurrentCustomer = { id: string; email: string; displayName: string; phone: string };

export async function getCurrentCustomer(client?: SupabaseLike): Promise<CurrentCustomer | null> {
  const supabase = client ?? await getServerSupabase();
  if (!supabase) return null;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from('profiles').select('display_name,phone').eq('id', user.id).maybeSingle();
  if (!profile) return null;
  return { id: user.id, email: user.email ?? '', displayName: profile.display_name ?? '', phone: profile.phone ?? '' };
}
