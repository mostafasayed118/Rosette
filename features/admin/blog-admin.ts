import type { Author, AuthorInput, BlogPostInput, BlogPostSummary } from '@/features/blog/types';

type AdminClient = { from: (table: string) => any };

const adminSelect = 'id,slug,type,city_code,author_id,title_en,title_ar,title_fr,excerpt_en,excerpt_ar,excerpt_fr,category,published,published_at,updated_at,cover_url';
const authorSelect = 'id,slug,name_en,name_ar,name_fr,role_en,role_ar,role_fr,bio_en,bio_ar,bio_fr,avatar_url';

function toSummary(row: Record<string, unknown>): BlogPostSummary {
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

function toAuthor(row: Record<string, unknown>): Author {
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

function toAuthorRow(input: AuthorInput) {
  return {
    slug: input.slug,
    name_en: input.nameEn,
    name_ar: input.nameAr || null,
    name_fr: input.nameFr || null,
    role_en: input.roleEn || null,
    role_ar: input.roleAr || null,
    role_fr: input.roleFr || null,
    bio_en: input.bioEn || null,
    bio_ar: input.bioAr || null,
    bio_fr: input.bioFr || null,
    avatar_url: input.avatarUrl || null,
    updated_at: new Date().toISOString(),
  };
}

function toRow(input: BlogPostInput, publishedAt: string | null) {
  return {
    slug: input.slug,
    type: input.type,
    city_code: input.cityCode || null,
    author_id: input.authorId || null,
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

export async function listAuthors(client: AdminClient): Promise<Author[]> {
  const { data, error } = await client.from('authors').select(authorSelect).order('name_en', { ascending: true });
  if (error) throw new Error(`Authors admin list failed: ${error.message}`);
  return ((data ?? []) as Record<string, unknown>[]).map(toAuthor);
}

export async function createAuthor(client: AdminClient, input: AuthorInput): Promise<{ id: string }> {
  const { data, error } = await client.from('authors').insert(toAuthorRow(input)).select('id').single();
  if (error) throw new Error(`Author create failed: ${error.message}`);
  return { id: String(data.id) };
}

export async function updateAuthor(client: AdminClient, id: string, input: AuthorInput): Promise<boolean> {
  const { error } = await client.from('authors').update(toAuthorRow(input)).eq('id', id);
  if (error) throw new Error(`Author update failed: ${error.message}`);
  return true;
}

export async function deleteAuthor(client: AdminClient, id: string): Promise<boolean> {
  const { error } = await client.from('authors').delete().eq('id', id);
  if (error) throw new Error(`Author delete failed: ${error.message}`);
  return true;
}