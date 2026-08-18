import { redirect } from 'next/navigation';
import { ProductForm } from '@/components/admin/ProductForm';
import { getCurrentAdmin } from '@/features/auth/server';

export default async function NewProductPage() {
  const admin = await getCurrentAdmin();
  if (!admin) redirect('/login');
  return <main className="content-frame"><p className="eyebrow">Catalog operations</p><h1>New product</h1><ProductForm /></main>;
}
