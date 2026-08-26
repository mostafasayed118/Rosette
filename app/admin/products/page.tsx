import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PageHeader } from '@/components/admin/PageHeader';
import { getCurrentAdmin } from '@/features/auth/server';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { getServerT } from '@/features/i18n/server';
import { formatMoney } from '@/features/money';

export default async function AdminProductsPage() {
  const admin = await getCurrentAdmin();
  if (!admin) redirect('/login');
  const { t, locale } = await getServerT();
  const { data } = await getAdminSupabase().from('products').select('id,slug,name_en,name_ar,price_minor,active').order('created_at', { ascending: false });
  const rows = (data ?? []) as Array<{ id: string; slug: string; name_en: string; name_ar: string; price_minor: number; active: boolean }>;
  return <>
    <PageHeader eyebrow={t('catalogOperations')} title={t('products')} actions={<Button asChild size="sm"><Link href="/admin/products/new">{t('newProduct')}</Link></Button>} />
    <Card className="mt-6"><Table><TableHeader><TableRow><TableHead>{t('products')}</TableHead><TableHead>{t('nameAr')}</TableHead><TableHead className="text-end">{t('priceEgp')}</TableHead><TableHead>{t('active')}</TableHead></TableRow></TableHeader><TableBody>{rows.map((product) => (
      <TableRow key={product.id}>
        <TableCell><Link className="font-medium text-primary underline-offset-4 hover:underline" href={`/admin/products/${product.id}`}>{product.name_en}</Link></TableCell>
        <TableCell className="text-muted-foreground">{product.name_ar}</TableCell>
        <TableCell className="text-end">{formatMoney(product.price_minor, locale)}</TableCell>
        <TableCell>{product.active ? <Badge>{t('active')}</Badge> : <Badge variant="secondary">{t('inactive')}</Badge>}</TableCell>
      </TableRow>
    ))}</TableBody></Table></Card>
  </>;
}
