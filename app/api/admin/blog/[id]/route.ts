import { NextResponse } from 'next/server';
import { deleteBlogPost } from '@/features/admin/blog-admin';
import { getCurrentAdmin } from '@/features/auth/server';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { logger } from '@/lib/logger';

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Admin authorization required' }, { status: 403 });
  const { id } = await context.params;
  try {
    await deleteBlogPost(getAdminSupabase(), id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    logger.error('route.error', { scope: 'admin blog delete', error });
    return NextResponse.json({ error: 'Could not delete blog post' }, { status: 500 });
  }
}
