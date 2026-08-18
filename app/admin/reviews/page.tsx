import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { StatusMessage } from '@/components/ui/status-message';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AdminShell } from '@/components/admin/AdminShell';
import { AutoRefresh } from '@/components/admin/AutoRefresh';
import { ReviewQueueActions } from '@/components/admin/ReviewQueueActions';
import { StarRating } from '@/components/ui/StarRating';
import { getCurrentAdmin } from '@/features/auth/server';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { getServerT } from '@/features/i18n/server';

type ReviewRow = {
  id: string;
  rating: number;
  body: string;
  createdAt: string;
  reviewedAt: string | null;
  reviewedByName: string | null;
  product: { id: string; name_en: string } | null;
};

export default async function AdminReviewsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const admin = await getCurrentAdmin();
  if (!admin) redirect('/login');
  const { t, locale } = await getServerT();
  const params = await searchParams;
  const showApproved = params.status === 'approved';

  const supabase = getAdminSupabase();
  const select = 'id,rating,body,status,created_at,reviewed_at,reviewed_by,customer_id,products(name_en)';
  const [{ data: pendingRows }, { data: approvedRows }] = await Promise.all([
    supabase.from('product_reviews').select(select).eq('status', 'pending').order('created_at', { ascending: false }).limit(100),
    supabase.from('product_reviews').select(select).eq('status', 'approved').order('reviewed_at', { ascending: false }).limit(100),
  ]);

  const reviewerIds = [...new Set([...(pendingRows ?? []), ...(approvedRows ?? [])].map((row) => [row?.customer_id, row?.reviewed_by]).flat().filter((value): value is string => Boolean(value)))];
  const { data: profileRows } = reviewerIds.length ? await supabase.from('profiles').select('id,display_name').in('id', reviewerIds) : { data: [] };
  const profileNames = new Map((profileRows ?? []).map((profile) => [String(profile.id), String(profile.display_name ?? profile.id)]));

  const mapRow = (row: Record<string, any>): ReviewRow => ({
    id: String(row.id),
    rating: Number(row.rating),
    body: String(row.body),
    createdAt: String(row.created_at),
    reviewedAt: row.reviewed_at ? String(row.reviewed_at) : null,
    reviewedByName: row.reviewed_by ? profileNames.get(String(row.reviewed_by)) ?? null : null,
    product: row.products ? { id: String(row.products.id), name_en: String(row.products.name_en ?? '') } : null,
  });
  const pending = ((pendingRows ?? []) as Array<Record<string, any>>).map(mapRow);
  const approved = ((approvedRows ?? []) as Array<Record<string, any>>).map(mapRow);
  const rows = showApproved ? approved : pending;
  const date = (value: string) => new Date(value).toLocaleString(locale === 'ar' ? 'ar-EG' : locale === 'fr' ? 'fr-FR' : 'en-GB');

  const tabLink = 'text-sm font-bold underline-offset-4 hover:underline';
  const tabActive = 'text-primary underline';
  const tabIdle = 'text-muted-foreground';

  return <AdminShell>
    <AutoRefresh />
    <p className="text-xs font-bold uppercase tracking-[.16em] text-sage">{t('reviews')}</p>
    <h1 className="font-display text-[clamp(2rem,4vw,3rem)] leading-tight tracking-[-.02em]">{t('reviews')}</h1>

    <nav className="mt-4 flex items-center gap-6 border-b pb-2">
      <Link className={`${tabLink} ${showApproved ? tabIdle : tabActive}`} href="/admin/reviews">{t('pendingRequests', { count: pending.length })}</Link>
      <Link className={`${tabLink} ${showApproved ? tabActive : tabIdle}`} href="/admin/reviews?status=approved">{t('resolvedRequests', { count: approved.length })}</Link>
    </nav>

    {rows.length === 0 ? <StatusMessage title={showApproved ? t('noReviews') : t('noPendingReviews')} /> : <Card className="mt-4"><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>{t('products')}</TableHead><TableHead>{t('rating')}</TableHead><TableHead>{t('reviews')}</TableHead>{showApproved ? <TableHead>{t('reviewedBy')}</TableHead> : <TableHead className="text-end">{t('review')}</TableHead>}</TableRow></TableHeader><TableBody>{rows.map((review) => (
      <TableRow key={review.id}>
        <TableCell><Link className="font-medium text-primary underline-offset-4 hover:underline" href={`/admin/products/${review.product?.id ?? ''}`}>{review.product?.name_en ?? '—'}</Link><span className="block text-sm text-muted-foreground">{date(review.createdAt)}</span></TableCell>
        <TableCell><StarRating value={review.rating} /></TableCell>
        <TableCell className="max-w-md"><p className="line-clamp-3 text-sm">{review.body}</p>{review.reviewedAt ? <span className="block text-xs text-muted-foreground">{date(review.reviewedAt)}</span> : null}</TableCell>
        {showApproved ? <TableCell>{review.reviewedByName ?? '—'}</TableCell> : <TableCell className="text-end"><ReviewQueueActions reviewId={review.id} /></TableCell>}
      </TableRow>
    ))}</TableBody></Table></div></Card>}
  </AdminShell>;
}
