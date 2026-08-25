import { getServerSupabase } from '@/lib/supabase/server';
import type { Author, BlogListQuery, BlogPost, BlogRepository, BlogPostSummary } from './types';

const authorSelect = 'id,slug,name_en,name_ar,name_fr,role_en,role_ar,role_fr,bio_en,bio_ar,bio_fr,avatar_url';
const summarySelect = 'id,slug,type,city_code,author_id,title_en,title_ar,title_fr,excerpt_en,excerpt_ar,excerpt_fr,category,published_at,updated_at';
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

export const supabaseBlogRepository: BlogRepository = {
  async listPublished(query?: BlogListQuery) {
    const supabase = await getServerSupabase();
    if (!supabase) return [];
    let builder = supabase.from('blog_posts').select(summarySelect).eq('published', true);
    if (query?.type) builder = builder.eq('type', query.type);
    if (query?.cityCode) builder = builder.eq('city_code', query.cityCode);
    if (query?.authorId) builder = builder.eq('author_id', query.authorId);
    const { data, error } = await builder.order('published_at', { ascending: false }).limit(100);
    if (error) throw new Error(`Blog list query failed: ${error.message}`);
    return ((data ?? []) as BlogRow[]).map(toSummary);
  },
  async getBySlug(slug: string) {
    const supabase = await getServerSupabase();
    if (!supabase) return null;
    const { data, error } = await supabase.from('blog_posts').select(detailSelect).eq('slug', slug).eq('published', true).maybeSingle();
    if (error) throw new Error(`Blog detail query failed: ${error.message}`);
    return data ? toPost(data as BlogRow) : null;
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
