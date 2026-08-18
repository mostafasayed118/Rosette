import { NextResponse } from 'next/server';
import { createAuthor, updateAuthor } from '@/features/admin/blog-admin';
import type { AuthorInput } from '@/features/blog/types';
import { getCurrentAdmin } from '@/features/auth/server';
import { getAdminSupabase } from '@/lib/supabase/admin';

function badRequest(): NextResponse {
  return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
}

export async function POST(request: Request) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Admin authorization required' }, { status: 403 });
  const body = (await request.json()) as Record<string, unknown>;
  const input = body.author as unknown;
  if (!input || typeof input !== 'object') return badRequest();
  const author = input as AuthorInput;
  if (typeof author.slug !== 'string' || typeof author.nameEn !== 'string') return badRequest();
  try {
    if (body.action === 'update-author') {
      const id = body.id;
      if (typeof id !== 'string') return badRequest();
      await updateAuthor(getAdminSupabase(), id, author);
      return NextResponse.json({ ok: true });
    }
    if (body.action === 'create-author') {
      const result = await createAuthor(getAdminSupabase(), author);
      return NextResponse.json({ ok: true, id: result.id }, { status: 201 });
    }
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not save author';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
