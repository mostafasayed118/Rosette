import type { BlogPostInput, BlogPostSummary } from '@/features/blog/types';

type AdminClient = { from: (table: string) => any };

const adminSelect = 'id,slug,type,city_code,title_en,title_ar,title_fr,excerpt_en,excerpt_ar,excerpt_fr,category,published,published_at,updated_at';

function toSummary(row: Record<string, unknown>): BlogPostSummary {
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

function toRow(input: BlogPostInput, publishedAt: string | null) {
  return {
    slug: input.slug,
    type: input.type,
    city_code: input.cityCode || null,
    title_en: input.titleEn,
    title_ar: input.titleAr || null,
    title_fr: input.titleFr || null,
    excerpt_en: input.excerptEn || null,
    excerpt_ar: input.excerptAr || null,
    excerpt_fr: input.excerptFr || null,
    content_en: input.contentEn,
    content_ar: input.contentAr || null,
    content_fr: input.contentFr || null,
    category: input.category || null,
    published: input.published,
    published_at: publishedAt,
    updated_at: new Date().toISOString(),
  };
}

export async function listAllBlogPosts(client: AdminClient): Promise<BlogPostSummary[]> {
  const { data, error } = await client.from('blog_posts').select(adminSelect).order('updated_at', { ascending: false });
  if (error) throw new Error(`Blog admin list failed: ${error.message}`);
  return ((data ?? []) as Record<string, unknown>[]).map(toSummary);
}

export async function createBlogPost(client: AdminClient, input: BlogPostInput): Promise<{ id: string }> {
  const publishedAt = input.published ? new Date().toISOString() : null;
  const { data, error } = await client.from('blog_posts').insert(toRow(input, publishedAt)).select('id').single();
  if (error) throw new Error(`Blog create failed: ${error.message}`);
  return { id: String(data.id) };
}

export async function updateBlogPost(client: AdminClient, id: string, input: BlogPostInput): Promise<boolean> {
  const { data: existing } = await client.from('blog_posts').select('published_at').eq('id', id).maybeSingle();
  const publishedAt = input.published && !existing?.published_at ? new Date().toISOString() : (existing?.published_at ?? null);
  const { error } = await client.from('blog_posts').update(toRow(input, publishedAt)).eq('id', id);
  if (error) throw new Error(`Blog update failed: ${error.message}`);
  return true;
}

export async function deleteBlogPost(client: AdminClient, id: string): Promise<boolean> {
  const { error } = await client.from('blog_posts').delete().eq('id', id);
  if (error) throw new Error(`Blog delete failed: ${error.message}`);
  return true;
}
