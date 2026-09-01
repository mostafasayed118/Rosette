import type { Author, BlogPostInput, BlogPostSummary } from '@/features/blog/types';
import { listAllBlogPosts, listAuthors as listAuthorsInternal } from '../blog-admin';
import { getAdminClient, type AdminClient } from './client';

export type AdminAuthorOption = { id: string; nameEn: string };

export async function listAdminBlogPosts(client: AdminClient = getAdminClient()): Promise<BlogPostSummary[]> {
  return listAllBlogPosts(client);
}

export async function listAdminAuthorOptions(client: AdminClient = getAdminClient()): Promise<AdminAuthorOption[]> {
  const authors: Author[] = await listAuthorsInternal(client);
  return authors.map((author) => ({ id: author.id, nameEn: author.nameEn }));
}

export async function getAdminBlogPost(
  postId: string,
  client: AdminClient = getAdminClient(),
): Promise<BlogPostInput | null> {
  const { data } = await client.from('blog_posts').select('*').eq('id', postId).maybeSingle();
  if (!data) return null;
  const row = data as Record<string, unknown>;
  const optional = (value: unknown) => (value == null ? undefined : String(value));
  return {
    slug: String(row.slug ?? ''),
    type: row.type === 'city' ? 'city' : 'post',
    cityCode: row.city_code ? String(row.city_code) : null,
    authorId: row.author_id ? String(row.author_id) : null,
    titleEn: String(row.title_en ?? ''),
    titleAr: optional(row.title_ar),
    titleFr: optional(row.title_fr),
    excerptEn: optional(row.excerpt_en),
    excerptAr: optional(row.excerpt_ar),
    excerptFr: optional(row.excerpt_fr),
    contentEn: String(row.content_en ?? ''),
    contentAr: optional(row.content_ar),
    contentFr: optional(row.content_fr),
    category: optional(row.category),
    coverUrl: optional(row.cover_url) ?? null,
    published: Boolean(row.published),
  };
}
