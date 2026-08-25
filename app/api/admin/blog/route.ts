import { NextResponse } from 'next/server';
import { createBlogPost, updateBlogPost } from '@/features/admin/blog-admin';
import type { BlogPostInput } from '@/features/blog/types';
import { getCurrentAdmin } from '@/features/auth/server';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { logRouteError } from '@/lib/api';

function badRequest(): NextResponse {
  return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
}

export async function POST(request: Request) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Admin authorization required' }, { status: 403 });
  const body = (await request.json()) as Record<string, unknown>;
  const input = body.post as unknown;
  if (!input || typeof input !== 'object') return badRequest();
  const post = input as BlogPostInput;
  if (typeof post.slug !== 'string' || typeof post.titleEn !== 'string' || typeof post.contentEn !== 'string' || typeof post.published !== 'boolean') return badRequest();
  try {
    if (body.action === 'update-post') {
      const id = body.id;
      if (typeof id !== 'string') return badRequest();
      await updateBlogPost(getAdminSupabase(), id, post);
      return NextResponse.json({ ok: true });
    }
    if (body.action === 'create-post') {
      const result = await createBlogPost(getAdminSupabase(), post);
      return NextResponse.json({ ok: true, id: result.id }, { status: 201 });
    }
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    logRouteError('admin blog save', error);
    return NextResponse.json({ error: 'Could not save blog post' }, { status: 500 });
  }
}
