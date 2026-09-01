import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PageHeader } from '@/components/admin/PageHeader';
import { ImagePreview } from '@/components/admin/ImagePreview';
import { getCurrentAdmin } from '@/features/auth/server';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { getAdminServerT } from '@/features/i18n/admin-server';
import { formatMoney } from '@/features/money';

const PAGE_SIZE = 25;

function first(value: string | string[] | undefined) {
  return typeof value === 'string' ? value : undefined;
}

export default async function AdminProductsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [admin, tData, params] = await Promise.all([getCurrentAdmin(), getAdminServerT(), searchParams]);
  if (!admin) redirect('/login');
  const { t, locale } = tData;
  const page = Math.max(1, Number.parseInt(first(params.page) ?? '1', 10) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;
  const { data, count } = await getAdminSupabase()
    .from('products')
    .select('id,slug,name_en,name_ar,price_minor,active,image_url', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to);
  const rows = (data ?? []) as Array<{ id: string; slug: string; name_en: string; name_ar: string; price_minor: number; active: boolean; image_url: string | null }>;
  const total = count ?? rows.length;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const current = Math.min(page, pageCount);

  function pageHref(p: number) {
    return `/admin/products?page=${p}`;
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader eyebrow={t('catalogOperations')} title={t('products')} actions={<Button asChild size="sm"><Link href="/admin/products/new">{t('newProduct')}</Link></Button>} />
      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[16rem]">{t('products')}</TableHead>
                <TableHead className="hidden md:table-cell">{t('nameAr')}</TableHead>
                <TableHead className="text-end">{t('priceEgp')}</TableHead>
                <TableHead>{t('active')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((product) => (
                <TableRow key={product.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <ImagePreview url={product.image_url} kind="product" width={48} height={48} fallback={<span className="text-xs font-medium">{product.name_en[0]?.toUpperCase()}</span>} />
                      <Link className="font-medium text-primary underline-offset-4 hover:underline" href={`/admin/products/${product.id}`} prefetch>
                        {product.name_en}
                      </Link>
                    </div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell whitespace-normal break-words text-muted-foreground">{product.name_ar}</TableCell>
                  <TableCell className="text-end tabular-nums">{formatMoney(product.price_minor, locale)}</TableCell>
                  <TableCell>{product.active ? <Badge>{t('active')}</Badge> : <Badge variant="secondary">{t('inactive')}</Badge>}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>
      {pageCount > 1 ? (
        <div className="flex flex-col items-center gap-2">
          <div className="flex flex-wrap items-center justify-center gap-1">
            {Array.from({ length: pageCount }, (_, i) => i + 1).map((p) => (
              <Link key={p} href={pageHref(p)} className={`inline-flex h-8 min-w-8 items-center justify-center rounded-md border px-2 text-sm ${p === current ? 'bg-primary text-primary-foreground border-primary' : 'bg-background hover:bg-accent'}`}>
                {p}
              </Link>
            ))}
          </div>
          <p className="text-sm text-muted-foreground">{t('pageOf', { page: current, pages: pageCount })} · {total} {t('products')}</p>
        </div>
      ) : null}
    </div>
  );
}
