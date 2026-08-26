import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { PageHeader } from '@/components/admin/PageHeader';
import { AuthorDeleteButton } from '@/components/admin/AuthorDeleteButton';
import { listAuthors } from '@/features/admin/blog-admin';
import { getCurrentAdmin } from '@/features/auth/server';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { getServerT } from '@/features/i18n/server';

export default async function AdminAuthorsPage() {
  const admin = await getCurrentAdmin();
  if (!admin) redirect('/login');
  const { t } = await getServerT();
  const rows = await listAuthors(getAdminSupabase());
  return <>
    <PageHeader eyebrow={t('authorOperations')} title={t('authors')} actions={<Link className="text-sm text-primary underline underline-offset-4" href="/admin/authors/new">{t('newAuthor')}</Link>} />
    <div className="mt-6 grid gap-4">
      {rows.map((row) => (
        <Card key={row.id}><CardContent className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1"><strong>{row.nameEn}</strong>{row.roleEn ? <span className="text-sm text-muted-foreground">{row.roleEn}</span> : null}</div>
            <p className="mt-1 text-sm text-muted-foreground">/{row.slug}</p>
          </div>
          <div className="flex items-center gap-3">
            <Link className="text-sm text-primary underline underline-offset-4" href={`/admin/authors/${row.id}`}>{t('edit')}</Link>
            <AuthorDeleteButton id={row.id} />
          </div>
        </CardContent></Card>
      ))}
    </div>
    <p className="mt-6"><Link className="text-sm text-primary underline underline-offset-4" href="/admin/blog">{t('backToBlog')}</Link></p>
  </>;
}
