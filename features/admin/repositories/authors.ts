import type { AuthorInput } from '@/features/blog/types';
import { getAdminClient, type AdminClient } from './client';

export type AdminAuthorRow = {
  id: string;
  slug: string;
  nameEn: string;
  nameAr: string | null;
  nameFr: string | null;
  roleEn: string | null;
  avatarUrl: string | null;
};

export async function listAdminAuthors(client: AdminClient = getAdminClient()): Promise<AdminAuthorRow[]> {
  const { data } = await client.from('authors').select('*').order('name_en', { ascending: true });
  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id ?? ''),
    slug: String(row.slug ?? ''),
    nameEn: String(row.name_en ?? ''),
    nameAr: row.name_ar == null ? null : String(row.name_ar),
    nameFr: row.name_fr == null ? null : String(row.name_fr),
    roleEn: row.role_en == null ? null : String(row.role_en),
    avatarUrl: row.avatar_url == null ? null : String(row.avatar_url),
  }));
}

export async function getAdminAuthor(
  authorId: string,
  client: AdminClient = getAdminClient(),
): Promise<AuthorInput | null> {
  const { data } = await client.from('authors').select('*').eq('id', authorId).maybeSingle();
  if (!data) return null;
  const row = data as Record<string, unknown>;
  const optional = (value: unknown) => (value == null ? undefined : String(value));
  return {
    slug: String(row.slug ?? ''),
    nameEn: String(row.name_en ?? ''),
    nameAr: optional(row.name_ar),
    nameFr: optional(row.name_fr),
    roleEn: optional(row.role_en),
    roleAr: optional(row.role_ar),
    roleFr: optional(row.role_fr),
    bioEn: optional(row.bio_en),
    bioAr: optional(row.bio_ar),
    bioFr: optional(row.bio_fr),
    avatarUrl: optional(row.avatar_url),
  };
}
