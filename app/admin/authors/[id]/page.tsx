import Link from 'next/link';
import { redirect } from 'next/navigation';
import { PageHeader } from '@/components/admin/PageHeader';
import { AuthorForm } from '@/components/admin/AuthorForm';
import type { AuthorInput } from '@/features/blog/types';
import { getCurrentAdmin } from '@/features/auth/server';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { getAdminServerT } from '@/features/i18n/admin-server';

export default async function AdminAuthorEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentAdmin();
  if (!admin) redirect('/login');
  const { t } = await getAdminServerT();
  const { id } = await params;
  if (id === 'new') {
    const blank: AuthorInput = { slug: '', nameEn: '' };
    return <><PageHeader eyebrow={t('authorOperations')} title={t('newAuthor')} /><div className="mt-6"><AuthorForm author={blank} /></div></>;
  }
  const { data } = await getAdminSupabase().from('authors').select('*').eq('id', id).maybeSingle();
  if (!data) { redirect('/admin/authors'); return null; }
  const row = data as Record<string, unknown>;
  const author: AuthorInput = {
    slug: String(row.slug ?? ''),
    nameEn: String(row.name_en ?? ''),
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
  return <><PageHeader eyebrow={t('authorOperations')} title={t('editAuthor')} /><p className="mt-1"><Link className="text-sm text-primary underline underline-offset-4" href="/admin/authors">{t('backToAuthors')}</Link></p><div className="mt-6"><AuthorForm author={author} id={id} /></div></>;
}
