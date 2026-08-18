import { redirect } from 'next/navigation';
import { AdminShell } from '@/components/admin/AdminShell';
import { ProductForm } from '@/components/admin/ProductForm';
import { getCurrentAdmin } from '@/features/auth/server';
import { getServerT } from '@/features/i18n/server';

export default async function NewProductPage() {
  const admin = await getCurrentAdmin();
  if (!admin) redirect('/login');
  const { t } = await getServerT();
  return <AdminShell><p className="eyebrow">{t('catalogOperations')}</p><h1>{t('newProduct')}</h1><ProductForm /></AdminShell>;
}
