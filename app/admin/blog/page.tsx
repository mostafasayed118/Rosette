import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { PageHeader } from '@/components/admin/PageHeader';
import { BlogDeleteButton } from '@/components/admin/BlogDeleteButton';
import { listAllBlogPosts } from '@/features/admin/blog-admin';
import { getCurrentAdmin } from '@/features/auth/server';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { getServerT } from '@/features/i18n/server';

export default async function AdminBlogPage() {
  const admin = await getCurrentAdmin();
  if (!admin) redirect('/login');
  const { t } = await getServerT();
  const rows = await listAllBlogPosts(getAdminSupabase());
  return <>
    <PageHeader eyebrow={t('blogOperations')} title={t('blogTitle')} actions={<Link className="text-sm text-primary underline underline-offset-4" href="/admin/blog/new">{t('newBlogPost')}</Link>} />
    <div className="mt-6 grid gap-4">
      {rows.map((row) => (
        <Card key={row.id}><CardContent className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <strong className="truncate">{row.titleEn}</strong>
              <Badge variant={row.publishedAt ? 'default' : 'secondary'}>{row.publishedAt ? t('active') : t('inactive')}</Badge>
              <Badge variant="outline">{row.type === 'city' ? t('blogTypeCity') : t('blogTypePost')}</Badge>
            </div>
            <p className="mt-1 truncate text-sm text-muted-foreground">/{row.slug}{row.cityCode ? ` · ${row.cityCode}` : ''}</p>
          </div>
          <div className="flex items-center gap-3">
            <Link className="text-sm text-primary underline underline-offset-4" href={`/admin/blog/${row.id}`}>{t('edit')}</Link>
            <BlogDeleteButton id={row.id} />
          </div>
        </CardContent></Card>
      ))}
    </div>
    <p className="mt-6"><Link className="text-sm text-primary underline underline-offset-4" href="/admin">{t('backToDashboard')}</Link></p>
  </>;
}
