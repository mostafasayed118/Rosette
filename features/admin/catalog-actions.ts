import type { AdminIdentity } from './authorization';
import { slugify, validateProductInput, type SaveProductInput } from './catalog-validation';

export type SaveProductResult = 'saved' | 'not_found' | 'validation' | 'slug_taken' | 'forbidden' | 'failure';

type CatalogClient = { from: (table: string) => any };

export async function saveProduct(
  client: CatalogClient,
  admin: AdminIdentity,
  input: { mode: 'create' | 'update'; id?: string; product: SaveProductInput },
): Promise<SaveProductResult> {
  if (admin.role !== 'admin') return 'forbidden';
  if (validateProductInput(input.product)) return 'validation';

  try {
    if (input.mode === 'create') {
      const slug = slugify(input.product.nameEn);
      const { data: existing } = await client.from('products').select('slug').eq('slug', slug).maybeSingle();
      if (existing) return 'slug_taken';
      const { data: created, error } = await client.from('products').insert(toProductRow(slug, input.product)).select('id').single();
      if (error || !created) return 'failure';
      for (const variant of input.product.variants) {
        const variantId = await insertVariant(client, created.id, variant);
        await setStock(client, variantId, variant.quantity);
      }
      await audit(client, admin, 'create_product', created.id, { slug });
      return 'saved';
    }

    const { data: product } = await client.from('products').select('id,slug').eq('id', input.id).maybeSingle();
    if (!product) return 'not_found';
    for (const variant of input.product.variants) {
      if (!variant.id) continue;
      const { data: stockRow } = await client.from('inventory').select('variant_id,reserved_quantity').eq('variant_id', variant.id).maybeSingle();
      if (stockRow && variant.quantity < stockRow.reserved_quantity) return 'validation';
    }
    const { error: updateError } = await client.from('products').update(toProductRow(product.slug, input.product)).eq('id', input.id);
    if (updateError) return 'failure';
    for (const variant of input.product.variants) {
      if (variant.id) {
        await client.from('product_variants').update({ name_en: variant.nameEn, name_ar: variant.nameAr, price_delta_minor: variant.priceDeltaMinor, active: variant.active }).eq('id', variant.id);
        await setStock(client, variant.id, variant.quantity);
      } else {
        const variantId = await insertVariant(client, input.id as string, variant);
        await setStock(client, variantId, variant.quantity);
      }
    }
    await audit(client, admin, 'update_product', input.id as string, {});
    return 'saved';
  } catch {
    return 'failure';
  }
}

export type SetInventoryResult = 'updated' | 'forbidden' | 'validation' | 'failure';

export async function setInventory(
  client: CatalogClient,
  admin: AdminIdentity,
  input: { variantId: string; quantity: number },
): Promise<SetInventoryResult> {
  if (admin.role !== 'admin' && admin.role !== 'operator') return 'forbidden';
  if (!Number.isInteger(input.quantity) || input.quantity < 0) return 'validation';
  try {
    const { data: row } = await client.from('inventory').select('variant_id,reserved_quantity').eq('variant_id', input.variantId).maybeSingle();
    if (row && input.quantity < row.reserved_quantity) return 'validation';
    if (row) {
      const { error } = await client.from('inventory').update({ quantity: input.quantity, updated_at: new Date().toISOString() }).eq('variant_id', input.variantId);
      if (error) return 'failure';
    } else {
      const { error } = await client.from('inventory').insert({ variant_id: input.variantId, quantity: input.quantity });
      if (error) return 'failure';
    }
    await client.from('admin_audit_logs').insert({ actor_id: admin.userId, action: 'update_inventory', target_type: 'inventory', target_id: input.variantId, metadata: { quantity: input.quantity } });
    return 'updated';
  } catch {
    return 'failure';
  }
}

function toProductRow(slug: string, input: SaveProductInput) {
  return {
    slug,
    name_en: input.nameEn,
    name_ar: input.nameAr,
    description_en: input.descriptionEn,
    description_ar: input.descriptionAr,
    category: input.category,
    occasions: input.occasions,
    price_minor: input.priceMinor,
    tone: input.tone,
    image_url: input.imageUrl || null,
    delivery: input.delivery,
    active: input.active,
    add_ons: input.addOns.map((addOn) => ({ id: addOn.id, name_en: addOn.nameEn, name_ar: addOn.nameAr, price_minor: addOn.priceMinor })),
  };
}

async function insertVariant(client: CatalogClient, productId: string, variant: SaveProductInput['variants'][number]) {
  const { data, error } = await client.from('product_variants').insert({ product_id: productId, name_en: variant.nameEn, name_ar: variant.nameAr, price_delta_minor: variant.priceDeltaMinor, active: variant.active }).select('id').single();
  if (error || !data) throw new Error('variant insert failed');
  return data.id;
}

async function setStock(client: CatalogClient, variantId: string, quantity: number) {
  const { data: row } = await client.from('inventory').select('variant_id,reserved_quantity').eq('variant_id', variantId).maybeSingle();
  if (row) {
    const { error } = await client.from('inventory').update({ quantity, updated_at: new Date().toISOString() }).eq('variant_id', variantId);
    if (error) throw new Error('stock update failed');
  } else {
    const { error } = await client.from('inventory').insert({ variant_id: variantId, quantity });
    if (error) throw new Error('stock insert failed');
  }
}

async function audit(client: CatalogClient, admin: AdminIdentity, action: string, targetId: string, metadata: Record<string, unknown>) {
  await client.from('admin_audit_logs').insert({ actor_id: admin.userId, action, target_type: 'product', target_id: targetId, metadata });
}