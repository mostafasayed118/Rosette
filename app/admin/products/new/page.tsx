import { redirect } from 'next/navigation';
import { PageHeader } from '@/components/admin/PageHeader';
import { ProductForm } from '@/components/admin/ProductForm';
import { getCurrentAdmin } from '@/features/auth/server';
import { getServerT } from '@/features/i18n/server';

export default async function NewProductPage() {
  const admin = await getCurrentAdmin();
  if (!admin) redirect('/login');
  const { t } = await getServerT();
  return <><PageHeader eyebrow={t('catalogOperations')} title={t('newProduct')} /><div className="mt-6"><ProductForm /></div></>;
}
