import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AdminShell } from '@/components/admin/AdminShell';
import { BlogForm } from '@/components/admin/BlogForm';
import { listAuthors } from '@/features/admin/blog-admin';
import type { BlogPostInput } from '@/features/blog/types';
import { getCurrentAdmin } from '@/features/auth/server';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { getServerT } from '@/features/i18n/server';

export default async function AdminBlogEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentAdmin();
  if (!admin) redirect('/login');
  const { t } = await getServerT();
  const { id } = await params;
  const authors = (await listAuthors(getAdminSupabase())).map((author) => ({ id: author.id, nameEn: author.nameEn }));
  if (id === 'new') {
    const blank: BlogPostInput = { slug: '', type: 'post', cityCode: null, titleEn: '', contentEn: '', published: false };
    return <AdminShell><p className="text-xs font-bold uppercase tracking-[.16em] text-sage">{t('blogOperations')}</p><h1 className="font-display text-[clamp(2rem,4vw,3rem)] leading-tight tracking-[-.02em]">{t('newBlogPost')}</h1><div className="mt-6"><BlogForm post={blank} authors={authors} /></div></AdminShell>;
  }
  const { data } = await getAdminSupabase().from('blog_posts').select('*').eq('id', id).maybeSingle();
  if (!data) { redirect('/admin/blog'); return null; }
  const row = data as Record<string, unknown>;
  const post: BlogPostInput = {
    slug: String(row.slug),
    type: row.type === 'city' ? 'city' : 'post',
    cityCode: row.city_code ? String(row.city_code) : null,
    authorId: row.author_id ? String(row.author_id) : null,
    titleEn: String(row.title_en ?? ''),
    titleAr: row.title_ar ? String(row.title_ar) : undefined,
    titleFr: row.title_fr ? String(row.title_fr) : undefined,
    excerptEn: row.excerpt_en ? String(row.excerpt_en) : undefined,
    excerptAr: row.excerpt_ar ? String(row.excerpt_ar) : undefined,
    excerptFr: row.excerpt_fr ? String(row.excerpt_fr) : undefined,
    contentEn: String(row.content_en ?? ''),
    contentAr: row.content_ar ? String(row.content_ar) : undefined,
    contentFr: row.content_fr ? String(row.content_fr) : undefined,
    category: row.category ? String(row.category) : undefined,
    published: Boolean(row.published),
  };
  return <AdminShell><p className="text-xs font-bold uppercase tracking-[.16em] text-sage">{t('blogOperations')}</p><h1 className="font-display text-[clamp(2rem,4vw,3rem)] leading-tight tracking-[-.02em]">{t('editBlogPost')}</h1><p className="mt-1"><Link className="text-sm text-primary underline underline-offset-4" href="/admin/blog">{t('backToBlog')}</Link></p><div className="mt-6"><BlogForm post={post} id={id} authors={authors} /></div></AdminShell>;
}
