import { redirect } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AdminShell } from '@/components/admin/AdminShell';
import { SetQuantityForm } from '@/components/admin/SetQuantityForm';
import { getCurrentAdmin } from '@/features/auth/server';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { getServerT } from '@/features/i18n/server';

export default async function AdminInventoryPage() {
  const admin = await getCurrentAdmin();
  if (!admin) redirect('/login');
  const { t } = await getServerT();
  const { data } = await getAdminSupabase().from('inventory').select('variant_id,quantity,reserved_quantity,updated_at').order('updated_at', { ascending: false });
  const rows = (data ?? []) as Array<{ variant_id: string; quantity: number; reserved_quantity: number }>;
  return <AdminShell>
    <p className="eyebrow">{t('stockOperations')}</p>
    <h1 className="font-display text-[clamp(2rem,4vw,3rem)] leading-tight tracking-[-.02em]">{t('inventory')}</h1>
    <Card className="mt-6"><Table><TableHeader><TableRow><TableHead>{t('variant')}</TableHead><TableHead>{t('available')}</TableHead><TableHead>{t('reserved')}</TableHead><TableHead className="text-end">{t('setQuantity')}</TableHead></TableRow></TableHeader><TableBody>{rows.map((row) => (
      <TableRow key={row.variant_id}>
        <TableCell className="font-medium">{row.variant_id}</TableCell>
        <TableCell>{Math.max(0, row.quantity - row.reserved_quantity)}</TableCell>
        <TableCell>{row.reserved_quantity}</TableCell>
        <TableCell className="text-end"><SetQuantityForm variantId={row.variant_id} current={row.quantity} /></TableCell>
      </TableRow>
    ))}</TableBody></Table></Card>
  </AdminShell>;
}
