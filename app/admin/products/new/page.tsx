import { redirect } from 'next/navigation';
import { PageHeader } from '@/components/admin/PageHeader';
import ProductFormClient from '@/components/admin/ProductFormClient';
import { getCurrentAdmin } from '@/features/auth/server';
import { getAdminServerT } from '@/features/i18n/admin-server';

export default async function NewProductPage() {
  const admin = await getCurrentAdmin();
  if (!admin) redirect('/login');
  const { t } = await getAdminServerT();
  return <><PageHeader eyebrow={t('catalogOperations')} title={t('newProduct')} /><div className="mt-6"><ProductFormClient /></div></>;
}
