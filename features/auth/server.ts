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

/**
 * Authorization for content-authoring endpoints (blog posts, delivery copy,
 * authors). `getCurrentAdmin` also admits `operator`, but authored HTML is
 * rendered with `dangerouslySetInnerHTML`, so an operator could inject script
 * that executes in an admin's session. Authoring is `admin`-only.
 */
export async function getCurrentContentAdmin(): Promise<AdminIdentity | null> {
  const identity = await getCurrentAdmin();
  return identity?.role === 'admin' ? identity : null;
}
