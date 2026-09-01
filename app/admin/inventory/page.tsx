import { redirect } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PageHeader } from '@/components/admin/PageHeader';
import { SetQuantityForm } from '@/components/admin/SetQuantityForm';
import { getCurrentAdmin } from '@/features/auth/server';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { getAdminServerT } from '@/features/i18n/admin-server';

const PAGE_SIZE = 50;

function first(value: string | string[] | undefined) {
  return typeof value === 'string' ? value : undefined;
}

function AvailableBadge({ available }: { available: number }) {
  if (available === 0) return <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-destructive" /><span className="font-medium text-destructive">0</span></span>;
  if (available <= 1) return <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-warning" /><span className="font-medium text-warning">{available}</span></span>;
  if (available <= 3) return <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-warning/60" /><span>{available}</span></span>;
  return <span className="tabular-nums">{available}</span>;
}

export default async function AdminInventoryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [admin, tData, params] = await Promise.all([getCurrentAdmin(), getAdminServerT(), searchParams]);
  if (!admin) redirect('/login');
  const { t } = tData;
  const page = Math.max(1, Number.parseInt(first(params.page) ?? '1', 10) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;
  const { data, count } = await getAdminSupabase()
    .from('inventory')
    .select('variant_id,quantity,reserved_quantity,updated_at,product_variants(name_en)', { count: 'exact' })
    .order('updated_at', { ascending: false })
    .range(from, to);
  const rows = ((data ?? []) as unknown) as Array<{ variant_id: string; quantity: number; reserved_quantity: number; product_variants?: { name_en: string } | null }>;
  const total = count ?? rows.length;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const current = Math.min(page, pageCount);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader eyebrow={t('stockOperations')} title={t('inventory')} />
      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[14rem]">{t('variant')}</TableHead>
                <TableHead>{t('available')}</TableHead>
                <TableHead>{t('reserved')}</TableHead>
                <TableHead className="text-end min-w-[10rem]">{t('setQuantity')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.variant_id}>
                  <TableCell className="font-medium whitespace-normal break-words">{row.product_variants?.name_en ?? row.variant_id}</TableCell>
                  <TableCell className="tabular-nums">
                    <AvailableBadge available={Math.max(0, row.quantity - row.reserved_quantity)} />
                  </TableCell>
                  <TableCell className="tabular-nums">{row.reserved_quantity}</TableCell>
                  <TableCell className="text-end">
                    <SetQuantityForm variantId={row.variant_id} current={row.quantity} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>
      {pageCount > 1 ? (
        <div className="flex flex-col items-center gap-2">
          <div className="flex flex-wrap justify-center gap-1">
            {Array.from({ length: pageCount }, (_, i) => i + 1).map((p) => (
              <a key={p} href={`/admin/inventory?page=${p}`} className={`inline-flex h-8 min-w-8 items-center justify-center rounded-md border px-2 text-sm ${p === current ? 'bg-primary text-primary-foreground border-primary' : 'bg-background hover:bg-accent'}`}>
                {p}
              </a>
            ))}
          </div>
          <p className="text-sm text-muted-foreground">{current} / {pageCount} · {total} variants</p>
        </div>
      ) : null}
    </div>
  );
}
