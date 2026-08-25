import { NextResponse } from 'next/server';
import { deleteAuthor } from '@/features/admin/blog-admin';
import { getCurrentAdmin } from '@/features/auth/server';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { logger } from '@/lib/logger';

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Admin authorization required' }, { status: 403 });
  const { id } = await context.params;
  try {
    await deleteAuthor(getAdminSupabase(), id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    logger.error('route.error', { scope: 'admin author delete', error });
    return NextResponse.json({ error: 'Could not delete author' }, { status: 500 });
  }
}
