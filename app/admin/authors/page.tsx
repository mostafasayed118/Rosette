import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/admin/PageHeader';
import { AuthorDeleteButton } from '@/components/admin/AuthorDeleteButton';
import { ImagePreview } from '@/components/admin/ImagePreview';
import { listAuthors } from '@/features/admin/blog-admin';
import { getCurrentAdmin } from '@/features/auth/server';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { getAdminServerT } from '@/features/i18n/admin-server';

export default async function AdminAuthorsPage() {
  const [admin, tData] = await Promise.all([getCurrentAdmin(), getAdminServerT()]);
  if (!admin) redirect('/login');
  const { t } = tData;
  const rows = await listAuthors(getAdminSupabase());
  return (
    <div className="flex flex-col gap-4">
      <PageHeader eyebrow={t('authorOperations')} title={t('authors')} actions={<Link className="text-sm text-primary underline underline-offset-4" href="/admin/authors/new">{t('newAuthor')}</Link>} />
      <div className="grid gap-4">
      {rows.map((row) => (
        <Card key={row.id}>
          <CardHeader><CardTitle>{row.nameEn}</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <ImagePreview url={row.avatarUrl} kind="avatar" width={32} height={32} fallback={<span className="text-xs font-medium">{row.nameEn[0]?.toUpperCase()}</span>} />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">{row.roleEn ? <span className="text-sm text-muted-foreground">{row.roleEn}</span> : null}</div>
                <p className="mt-1 text-sm text-muted-foreground">/{row.slug}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Link className="text-sm text-primary underline underline-offset-4" href={`/admin/authors/${row.id}`}>{t('edit')}</Link>
              <AuthorDeleteButton id={row.id} />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
      <p>
        <Link className="text-sm font-medium text-primary underline underline-offset-4" href="/admin/blog">
          {t('backToBlog')}
        </Link>
      </p>
    </div>
  );
}
