import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAuthor, createBlogPost, deleteAuthor, deleteBlogPost, listAllBlogPosts, listAuthors, updateAuthor, updateBlogPost } from '@/features/admin/blog-admin';
import { localAuthors, localPosts } from '@/features/blog/data';
import { localBlogRepository } from '@/features/blog/local-repository';
import { supabaseBlogRepository } from '@/features/blog/supabase-repository';

vi.mock('@/lib/supabase/server', () => ({ getServerSupabase: vi.fn() }));
import { getServerSupabase } from '@/lib/supabase/server';
const mockGetSupabase = vi.mocked(getServerSupabase);

beforeEach(() => vi.clearAllMocks());

const row = {
  id: 'p1', slug: 'hello-roses', type: 'post', city_code: null, author_id: 'a1',
  title_en: 'Hello roses', title_ar: 'مرحبا بالورد', title_fr: null,
  excerpt_en: 'An excerpt', excerpt_ar: null, excerpt_fr: null,
  category: 'care', published: true, published_at: '2026-08-10T00:00:00.000Z',
  updated_at: '2026-08-10T00:00:00.000Z', created_at: '2026-08-10T00:00:00.000Z',
  content_en: '<p>Body</p>', content_ar: null, content_fr: null,
};

const authorRow = {
  id: 'a1', slug: 'nour-hassan', name_en: 'Nour Hassan', name_ar: 'نور حسن', name_fr: null,
  role_en: 'Founder & head florist', role_ar: null, role_fr: null,
  bio_en: 'Nour founded Rosette.', bio_ar: null, bio_fr: null, avatar_url: null,
};

describe('blog storefront repository', () => {
  it('lists published rows with type/city filters and newest first', async () => {
    const eqCalls: Array<[string, unknown]> = [];
    const builder = {
      select: () => builder,
      eq: (col: string, val: unknown) => { eqCalls.push([col, val]); return builder; },
      order: async () => ({ data: [row], error: null }),
      maybeSingle: async () => ({ data: null, error: null }),
    };
    mockGetSupabase.mockResolvedValue({ from: () => builder } as never);

    const posts = await supabaseBlogRepository.listPublished({ type: 'post', cityCode: 'greater-cairo' });
    expect(eqCalls).toContainEqual(['published', true]);
    expect(eqCalls).toContainEqual(['type', 'post']);
    expect(eqCalls).toContainEqual(['city_code', 'greater-cairo']);
    expect(posts[0]).toMatchObject({ id: 'p1', slug: 'hello-roses', titleEn: 'Hello roses', titleAr: 'مرحبا بالورد', authorId: 'a1' });
  });

  it('returns a published post by slug', async () => {
    const builder = {
      select: () => builder,
      eq: () => builder,
      order: async () => ({ data: [], error: null }),
      maybeSingle: async () => ({ data: row, error: null }),
    };
    mockGetSupabase.mockResolvedValue({ from: () => builder } as never);

    const post = await supabaseBlogRepository.getBySlug('hello-roses');
    expect(post?.contentEn).toBe('<p>Body</p>');
    expect(post?.published).toBe(true);
  });

  it('returns null when a post is missing', async () => {
    const builder = { select: () => builder, eq: () => builder, order: async () => ({ data: [], error: null }), maybeSingle: async () => ({ data: null, error: null }) };
    mockGetSupabase.mockResolvedValue({ from: () => builder } as never);
    expect(await supabaseBlogRepository.getBySlug('missing')).toBeNull();
  });

  it('lists authors from supabase', async () => {
    const builder = { order: async () => ({ data: [authorRow], error: null }) };
    mockGetSupabase.mockResolvedValue({ from: () => ({ select: () => builder }) } as never);
    const authors = await supabaseBlogRepository.listAuthors();
    expect(authors[0]).toMatchObject({ id: 'a1', slug: 'nour-hassan', nameEn: 'Nour Hassan', roleEn: 'Founder & head florist' });
  });

  it('returns a single author from supabase', async () => {
    const builder = { eq: () => ({ maybeSingle: async () => ({ data: authorRow, error: null }) }) };
    mockGetSupabase.mockResolvedValue({ from: () => ({ select: () => builder }) } as never);
    const author = await supabaseBlogRepository.getAuthor('a1');
    expect(author?.bioEn).toBe('Nour founded Rosette.');
  });

  it('returns null when an author is missing', async () => {
    const builder = { eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) };
    mockGetSupabase.mockResolvedValue({ from: () => ({ select: () => builder }) } as never);
    expect(await supabaseBlogRepository.getAuthor('missing')).toBeNull();
  });

  it('returns an author by slug from supabase', async () => {
    const builder = { eq: () => ({ maybeSingle: async () => ({ data: authorRow, error: null }) }) };
    mockGetSupabase.mockResolvedValue({ from: () => ({ select: () => builder }) } as never);
    const author = await supabaseBlogRepository.getAuthorBySlug('nour-hassan');
    expect(author?.nameEn).toBe('Nour Hassan');
  });

  it('returns null when an author slug is missing', async () => {
    const builder = { eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) };
    mockGetSupabase.mockResolvedValue({ from: () => ({ select: () => builder }) } as never);
    expect(await supabaseBlogRepository.getAuthorBySlug('nope')).toBeNull();
  });

  it('filters published posts by author on supabase', async () => {
    const eqCalls: Array<[string, unknown]> = [];
    const builder = {
      select: () => builder,
      eq: (col: string, val: unknown) => { eqCalls.push([col, val]); return builder; },
      order: async () => ({ data: [row], error: null }),
      maybeSingle: async () => ({ data: null, error: null }),
    };
    mockGetSupabase.mockResolvedValue({ from: () => builder } as never);

    const posts = await supabaseBlogRepository.listPublished({ type: 'post', authorId: 'a1' });
    expect(eqCalls).toContainEqual(['author_id', 'a1']);
    expect(posts[0]).toMatchObject({ id: 'p1', authorId: 'a1' });
  });
});

describe('blog local repository', () => {
  it('lists authors and finds one by id', async () => {
    const authors = await localBlogRepository.listAuthors();
    expect(authors.length).toBeGreaterThan(0);
    expect((await localBlogRepository.getAuthor(authors[0]!.id))?.nameEn).toBe(authors[0]!.nameEn);
  });

  it('returns null for a missing local author', async () => {
    expect(await localBlogRepository.getAuthor('nope')).toBeNull();
  });

  it('summaries carry authorId', async () => {
    const posts = await localBlogRepository.listPublished({});
    expect(posts[0]?.authorId).toBeTruthy();
  });

  it('finds a local author by slug', async () => {
    expect((await localBlogRepository.getAuthorBySlug('nour-hassan'))?.nameEn).toBe('Nour Hassan');
    expect(await localBlogRepository.getAuthorBySlug('nope')).toBeNull();
  });

  it('filters local posts by author', async () => {
    const nour = localAuthors[0]!;
    const posts = await localBlogRepository.listPublished({ type: 'post', authorId: nour.id });
    expect(posts.length).toBeGreaterThan(0);
    expect(posts.every((post) => post.authorId === nour.id)).toBe(true);
    expect(localPosts.some((post) => post.authorId !== nour.id && post.type === 'post')).toBe(true);
  });
});

describe('blog admin CRUD', () => {
  type Call = { op: string; payload?: unknown; id?: string };
  function fakeClient(options: { existingPublishedAt?: string | null } = {}) {
    const calls: Call[] = [];
    const client = {
      from: (table: string) => ({
        select: () => ({
          order: async () => ({ data: [], error: null }),
          eq: () => ({ maybeSingle: async () => ({ data: { published_at: options.existingPublishedAt ?? null }, error: null }) }),
        }),
        insert: (payload: unknown) => ({
          select: () => ({ single: async () => { calls.push({ op: 'insert', payload }); return { data: { id: 'new-id' }, error: null }; } }),
        }),
        update: (payload: unknown) => ({
          eq: (_col: string, id: string) => { calls.push({ op: 'update', payload, id }); return { error: null }; },
        }),
        delete: () => ({
          eq: (_col: string, id: string) => { calls.push({ op: 'delete', id }); return { error: null }; },
        }),
      }),
    };
    return { client, calls };
  }

  const input = {
    slug: 'new-post', type: 'post' as const, cityCode: null,
    titleEn: 'New post', contentEn: '<p>Body</p>', published: true,
  };

  it('creates a published post with published_at set', async () => {
    const { client, calls } = fakeClient();
    const result = await createBlogPost(client, input);
    expect(result).toEqual({ id: 'new-id' });
    const insert = calls.find((c) => c.op === 'insert');
    expect((insert!.payload as Record<string, unknown>).published_at).not.toBeNull();
    expect((insert!.payload as Record<string, unknown>).title_en).toBe('New post');
  });

  it('creates an unpublished post with null published_at', async () => {
    const { client, calls } = fakeClient();
    await createBlogPost(client, { ...input, published: false });
    const insert = calls.find((c) => c.op === 'insert');
    expect((insert!.payload as Record<string, unknown>).published_at).toBeNull();
  });

  it('keeps the existing published_at when updating a published post', async () => {
    const { client, calls } = fakeClient({ existingPublishedAt: '2026-08-01T00:00:00.000Z' });
    await updateBlogPost(client, 'p1', input);
    const update = calls.find((c) => c.op === 'update');
    expect((update!.payload as Record<string, unknown>).published_at).toBe('2026-08-01T00:00:00.000Z');
  });

  it('sets published_at when first publishing', async () => {
    const { client, calls } = fakeClient({ existingPublishedAt: null });
    await updateBlogPost(client, 'p1', input);
    const update = calls.find((c) => c.op === 'update');
    expect((update!.payload as Record<string, unknown>).published_at).not.toBeNull();
  });

  it('deletes a post by id', async () => {
    const { client, calls } = fakeClient();
    expect(await deleteBlogPost(client, 'p1')).toBe(true);
    expect(calls).toContainEqual({ op: 'delete', id: 'p1' });
  });

  it('lists all posts for the admin', async () => {
    const client = { from: () => ({ select: () => ({ order: async () => ({ data: [row], error: null }) }) }) };
    const posts = await listAllBlogPosts(client);
    expect(posts[0]).toMatchObject({ id: 'p1', slug: 'hello-roses', authorId: 'a1' });
  });

  const authorInput = { slug: 'nour-hassan', nameEn: 'Nour Hassan', roleEn: 'Founder & head florist' };

  it('creates an author', async () => {
    const { client, calls } = fakeClient();
    const result = await createAuthor(client, authorInput);
    expect(result).toEqual({ id: 'new-id' });
    const insert = calls.find((c) => c.op === 'insert');
    expect((insert!.payload as Record<string, unknown>).name_en).toBe('Nour Hassan');
  });

  it('updates an author', async () => {
    const { client, calls } = fakeClient();
    await updateAuthor(client, 'a1', { ...authorInput, roleEn: 'Head florist' });
    const update = calls.find((c) => c.op === 'update');
    expect((update!.payload as Record<string, unknown>).role_en).toBe('Head florist');
    expect(update!.id).toBe('a1');
  });

  it('deletes an author', async () => {
    const { client, calls } = fakeClient();
    expect(await deleteAuthor(client, 'a1')).toBe(true);
    expect(calls).toContainEqual({ op: 'delete', id: 'a1' });
  });

  it('lists authors for the admin', async () => {
    const client = { from: () => ({ select: () => ({ order: async () => ({ data: [authorRow], error: null }) }) }) };
    const authors = await listAuthors(client);
    expect(authors[0]).toMatchObject({ id: 'a1', slug: 'nour-hassan' });
  });
});
