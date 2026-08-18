import { getServerSupabase } from '@/lib/supabase/server';
import type { BlogListQuery, BlogPost, BlogRepository, BlogPostSummary } from './types';

const summarySelect = 'id,slug,type,city_code,title_en,title_ar,title_fr,excerpt_en,excerpt_ar,excerpt_fr,category,published_at,updated_at';
const detailSelect = `${summarySelect},content_en,content_ar,content_fr,published,created_at`;

type BlogRow = Record<string, unknown>;

function toSummary(row: BlogRow): BlogPostSummary {
  return {
    id: String(row.id),
    slug: String(row.slug),
    type: row.type === 'city' ? 'city' : 'post',
    cityCode: row.city_code ? String(row.city_code) : null,
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
    const { data, error } = await builder.order('published_at', { ascending: false });
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
};
