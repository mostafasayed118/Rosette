import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AdminShell } from '@/components/admin/AdminShell';
import { ProductForm, type ProductFormInitial } from '@/components/admin/ProductForm';
import { getCurrentAdmin } from '@/features/auth/server';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { getServerT } from '@/features/i18n/server';

type VariantRow = { id: string; name_en: string; name_ar: string; price_delta_minor: number; active: boolean; inventory?: Array<{ quantity: number; reserved_quantity: number }> };
type AddOnRow = { id: string; name_en: string; name_ar: string; price_minor: number };

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentAdmin();
  if (!admin) redirect('/login');
  const { t } = await getServerT();
  const { id } = await params;
  const { data } = await getAdminSupabase().from('products').select('*,product_variants(*,inventory(quantity,reserved_quantity))').eq('id', id).maybeSingle();
  if (!data) return <AdminShell><h1 className="font-display text-[clamp(2rem,4vw,3rem)] leading-tight tracking-[-.02em]">{t('productNotFound')}</h1><p className="mt-4"><Link className="text-sm text-primary underline underline-offset-4" href="/admin/products">{t('backToProducts')}</Link></p></AdminShell>;

  const initial: ProductFormInitial = {
    id,
    nameEn: data.name_en, nameAr: data.name_ar, descriptionEn: data.description_en, descriptionAr: data.description_ar,
    category: data.category, occasions: data.occasions, priceMinor: data.price_minor, tone: data.tone, imageUrl: data.image_url ?? '',
    delivery: data.delivery, active: data.active,
    variants: ((data.product_variants ?? []) as VariantRow[]).map((variant) => ({
      id: variant.id, nameEn: variant.name_en, nameAr: variant.name_ar,
      priceDeltaMinor: variant.price_delta_minor, active: variant.active,
      quantity: variant.inventory?.[0]?.quantity ?? 0,
    })),
    addOns: ((data.add_ons ?? []) as AddOnRow[]).map((addOn) => ({ id: addOn.id, nameEn: addOn.name_en, nameAr: addOn.name_ar, priceMinor: addOn.price_minor })),
  };
  return <AdminShell><p className="text-xs font-bold uppercase tracking-[.16em] text-sage">{t('catalogOperations')}</p><h1 className="font-display text-[clamp(2rem,4vw,3rem)] leading-tight tracking-[-.02em]">{data.name_en}</h1><ProductForm initial={initial} /></AdminShell>;
}
