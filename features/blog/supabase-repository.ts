import { getServerSupabase } from '@/lib/supabase/server';
import type { Author, BlogListQuery, BlogPost, BlogRepository, BlogPostSummary } from './types';

const authorSelect = 'id,slug,name_en,name_ar,name_fr,role_en,role_ar,role_fr,bio_en,bio_ar,bio_fr,avatar_url';
const summarySelect = 'id,slug,type,city_code,author_id,title_en,title_ar,title_fr,excerpt_en,excerpt_ar,excerpt_fr,category,published_at,updated_at,cover_url';
const detailSelect = `${summarySelect},content_en,content_ar,content_fr,published,created_at`;

type BlogRow = Record<string, unknown>;
type AuthorRow = Record<string, unknown>;

function toAuthor(row: AuthorRow): Author {
  return {
    id: String(row.id),
    slug: String(row.slug),
    nameEn: String(row.name_en),
    nameAr: row.name_ar ? String(row.name_ar) : undefined,
    nameFr: row.name_fr ? String(row.name_fr) : undefined,
    roleEn: row.role_en ? String(row.role_en) : undefined,
    roleAr: row.role_ar ? String(row.role_ar) : undefined,
    roleFr: row.role_fr ? String(row.role_fr) : undefined,
    bioEn: row.bio_en ? String(row.bio_en) : undefined,
    bioAr: row.bio_ar ? String(row.bio_ar) : undefined,
    bioFr: row.bio_fr ? String(row.bio_fr) : undefined,
    avatarUrl: row.avatar_url ? String(row.avatar_url) : undefined,
  };
}

function toSummary(row: BlogRow): BlogPostSummary {
  return {
    id: String(row.id),
    slug: String(row.slug),
    type: row.type === 'city' ? 'city' : 'post',
    cityCode: row.city_code ? String(row.city_code) : null,
    authorId: row.author_id ? String(row.author_id) : null,
    titleEn: String(row.title_en),
    titleAr: row.title_ar ? String(row.title_ar) : undefined,
    titleFr: row.title_fr ? String(row.title_fr) : undefined,
    excerptEn: row.excerpt_en ? String(row.excerpt_en) : undefined,
    excerptAr: row.excerpt_ar ? String(row.excerpt_ar) : undefined,
    excerptFr: row.excerpt_fr ? String(row.excerpt_fr) : undefined,
    category: row.category ? String(row.category) : undefined,
    publishedAt: row.published_at ? String(row.published_at) : null,
    updatedAt: String(row.updated_at ?? ''),
    coverUrl: row.cover_url ? String(row.cover_url) : undefined,
  };
}

function toPost(row: BlogRow): BlogPost {
  const summary = toSummary(row);
  return {
    ...summary,
    contentEn: String(row.content_en ?? ''),
    contentAr: row.content_ar ? String(row.content_ar) : undefined,
    contentFr: row.content_fr ? String(row.content_fr) : undefined,
    published: Boolean(row.published),
    createdAt: String(row.created_at ?? ''),
  };
}

/**
 * The two cover-aware select strings are the same shape as their cover-less
 * fallbacks apart from one optional column, so every result is mapped through
 * `Record<string, unknown>` rows instead of supabase typegen. Typed per-query
 * builders broke when the two variants share one function, so keep the loose
 * boundary local to these helpers.
 */
type QueryResult<T> = { data: T | null; error: { message: string } | null };
type ListResult = QueryResult<BlogRow[]>;
type SingleResult = QueryResult<BlogRow>;

function buildListQuery(supabase: NonNullable<Awaited<ReturnType<typeof getServerSupabase>>>, select: string, query?: BlogListQuery): Promise<ListResult> {
  const builder = supabase.from('blog_posts').select(select).eq('published', true);
  let filtered = builder;
  if (query?.type) filtered = filtered.eq('type', query.type);
  if (query?.cityCode) filtered = filtered.eq('city_code', query.cityCode);
  if (query?.authorId) filtered = filtered.eq('author_id', query.authorId);
  return filtered.order('published_at', { ascending: false }).limit(100) as unknown as Promise<ListResult>;
}

function buildDetailQuery(supabase: NonNullable<Awaited<ReturnType<typeof getServerSupabase>>>, select: string, slug: string): Promise<SingleResult> {
  return supabase.from('blog_posts').select(select).eq('slug', slug).eq('published', true).maybeSingle() as unknown as Promise<SingleResult>;
}

export const supabaseBlogRepository: BlogRepository = {
  async listPublished(query?: BlogListQuery) {
    const supabase = await getServerSupabase();
    if (!supabase) return [];
    const first = await buildListQuery(supabase, summarySelect, query);
    if (first.error?.message.includes('cover_url')) {
      const fallback = await buildListQuery(supabase, summarySelect.replace(',cover_url', ''), query);
      if (fallback.error) throw new Error(`Blog list query failed: ${fallback.error.message}`);
      return ((fallback.data ?? []) as BlogRow[]).map(toSummary);
    }
    if (first.error) throw new Error(`Blog list query failed: ${first.error.message}`);
    return ((first.data ?? []) as BlogRow[]).map(toSummary);
  },
  async getBySlug(slug: string) {
    const supabase = await getServerSupabase();
    if (!supabase) return null;
    const first = await buildDetailQuery(supabase, detailSelect, slug);
    if (first.error?.message.includes('cover_url')) {
      const fallback = await buildDetailQuery(supabase, detailSelect.replace(',cover_url', ''), slug);
      if (fallback.error) throw new Error(`Blog detail query failed: ${fallback.error.message}`);
      return fallback.data ? toPost(fallback.data as BlogRow) : null;
    }
    if (first.error) throw new Error(`Blog detail query failed: ${first.error.message}`);
    return first.data ? toPost(first.data as BlogRow) : null;
  },
  async listAuthors() {
    const supabase = await getServerSupabase();
    if (!supabase) return [];
    const { data, error } = await supabase.from('authors').select(authorSelect).order('name_en', { ascending: true });
    if (error) throw new Error(`Authors list query failed: ${error.message}`);
    return ((data ?? []) as AuthorRow[]).map(toAuthor);
  },
  async getAuthor(id: string) {
    const supabase = await getServerSupabase();
    if (!supabase) return null;
    const { data, error } = await supabase.from('authors').select(authorSelect).eq('id', id).maybeSingle();
    if (error) throw new Error(`Author detail query failed: ${error.message}`);
    return data ? toAuthor(data as AuthorRow) : null;
  },
  async getAuthorBySlug(slug: string) {
    const supabase = await getServerSupabase();
    if (!supabase) return null;
    const { data, error } = await supabase.from('authors').select(authorSelect).eq('slug', slug).maybeSingle();
    if (error) throw new Error(`Author detail query failed: ${error.message}`);
    return data ? toAuthor(data as AuthorRow) : null;
  },
};
