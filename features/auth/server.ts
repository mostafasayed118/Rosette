import { getServerSupabase } from '@/lib/supabase/server';
import type { AdminIdentity, AdminRole } from '@/features/admin/authorization';

export async function getCurrentAdmin(): Promise<AdminIdentity | null> {
  const supabase = await getServerSupabase();
  if (!supabase) return null;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (profile?.role !== 'admin' && profile?.role !== 'operator') return null;
  return { userId: user.id, role: profile.role as AdminRole };
}

export async function requireAdmin() {
  const identity = await getCurrentAdmin();
  if (!identity) throw new Error('Admin authorization required');
  return identity;
}
