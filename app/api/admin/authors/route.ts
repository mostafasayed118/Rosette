import { NextResponse } from 'next/server';
import { createAuthor, updateAuthor } from '@/features/admin/blog-admin';
import { validateAuthorInput } from '@/features/admin/author-validation';
import type { AuthorInput } from '@/features/blog/types';
import { getCurrentAdmin } from '@/features/auth/server';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { logger } from '@/lib/logger';

function badRequest(): NextResponse {
  return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
}

export async function POST(request: Request) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Admin authorization required' }, { status: 403 });
  const body = (await request.json()) as Record<string, unknown>;
  const input = body.author as unknown;
  if (!input || typeof input !== 'object') return badRequest();
  const raw = input as AuthorInput;
  if (typeof raw.slug !== 'string' || typeof raw.nameEn !== 'string') return badRequest();
  const author: AuthorInput = { ...raw, slug: raw.slug.trim() };
  const invalid = validateAuthorInput(author);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });
  const client = getAdminSupabase();
  try {
    if (body.action === 'update-author') {
      const id = body.id;
      if (typeof id !== 'string') return badRequest();
      const { data: clash } = await client.from('authors').select('id').eq('slug', author.slug).neq('id', id).maybeSingle();
      if (clash) return NextResponse.json({ error: 'Slug already in use' }, { status: 409 });
      await updateAuthor(client, id, author);
      return NextResponse.json({ ok: true });
    }
    if (body.action === 'create-author') {
      const { data: clash } = await client.from('authors').select('id').eq('slug', author.slug).maybeSingle();
      if (clash) return NextResponse.json({ error: 'Slug already in use' }, { status: 409 });
      const result = await createAuthor(client, author);
      return NextResponse.json({ ok: true, id: result.id }, { status: 201 });
    }
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    logger.error('route.error', { scope: 'admin author save', error });
    return NextResponse.json({ error: 'Could not save author' }, { status: 500 });
  }
}
