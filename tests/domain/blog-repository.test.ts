import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createBlogPost, deleteBlogPost, listAllBlogPosts, updateBlogPost } from '@/features/admin/blog-admin';
import { supabaseBlogRepository } from '@/features/blog/supabase-repository';

vi.mock('@/lib/supabase/server', () => ({ getServerSupabase: vi.fn() }));
import { getServerSupabase } from '@/lib/supabase/server';
const mockGetSupabase = vi.mocked(getServerSupabase);

beforeEach(() => vi.clearAllMocks());

const row = {
  id: 'p1', slug: 'hello-roses', type: 'post', city_code: null,
  title_en: 'Hello roses', title_ar: 'مرحبا بالورد', title_fr: null,
  excerpt_en: 'An excerpt', excerpt_ar: null, excerpt_fr: null,
  category: 'care', published: true, published_at: '2026-08-10T00:00:00.000Z',
  updated_at: '2026-08-10T00:00:00.000Z', created_at: '2026-08-10T00:00:00.000Z',
  content_en: '<p>Body</p>', content_ar: null, content_fr: null,
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
    expect(posts[0]).toMatchObject({ id: 'p1', slug: 'hello-roses', titleEn: 'Hello roses', titleAr: 'مرحبا بالورد' });
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
    expect(posts[0]).toMatchObject({ id: 'p1', slug: 'hello-roses' });
  });
});
