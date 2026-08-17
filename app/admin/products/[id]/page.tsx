import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ProductForm, type ProductFormInitial } from '@/components/admin/ProductForm';
import { getCurrentAdmin } from '@/features/auth/server';
import { getAdminSupabase } from '@/lib/supabase/admin';

type VariantRow = { id: string; name_en: string; name_ar: string; price_delta_minor: number; active: boolean; inventory?: Array<{ quantity: number; reserved_quantity: number }> };
type AddOnRow = { id: string; name_en: string; name_ar: string; price_minor: number };

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentAdmin();
  if (!admin) redirect('/login');
  const { id } = await params;
  const { data } = await getAdminSupabase().from('products').select('*,product_variants(*,inventory(quantity,reserved_quantity))').eq('id', id).maybeSingle();
  if (!data) return <main className="content-frame"><h1>Product not found</h1><p><Link href="/admin/products">Back to products</Link></p></main>;

  const initial: ProductFormInitial = {
    id,
    nameEn: data.name_en, nameAr: data.name_ar, descriptionEn: data.description_en, descriptionAr: data.description_ar,
    category: data.category, occasions: data.occasions, priceMinor: data.price_minor, tone: data.tone,
    delivery: data.delivery, active: data.active,
    variants: ((data.product_variants ?? []) as VariantRow[]).map((variant) => ({
      id: variant.id, nameEn: variant.name_en, nameAr: variant.name_ar,
      priceDeltaMinor: variant.price_delta_minor, active: variant.active,
      quantity: variant.inventory?.[0]?.quantity ?? 0,
    })),
    addOns: ((data.add_ons ?? []) as AddOnRow[]).map((addOn) => ({ id: addOn.id, nameEn: addOn.name_en, nameAr: addOn.name_ar, priceMinor: addOn.price_minor })),
  };
  return <main className="content-frame"><p className="eyebrow">Catalog operations</p><h1>{data.name_en}</h1><ProductForm initial={initial} /></main>;
}
