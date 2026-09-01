import { getAdminClient, type AdminClient } from './client';

export type AdminInventoryRow = {
  variantId: string;
  variantName: string;
  available: number;
  reserved: number;
  quantity: number;
};

export async function listAdminInventory(client: AdminClient = getAdminClient()): Promise<AdminInventoryRow[]> {
  const { data } = await client
    .from('inventory')
    .select('variant_id,quantity,reserved_quantity,updated_at,product_variants(name_en)')
    .order('updated_at', { ascending: false });
  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => {
    const quantity = Number(row.quantity ?? 0);
    const reserved = Number(row.reserved_quantity ?? 0);
    const variant = (row.product_variants ?? null) as { name_en?: string } | null;
    return {
      variantId: String(row.variant_id ?? ''),
      variantName: variant?.name_en ? String(variant.name_en) : String(row.variant_id ?? ''),
      available: Math.max(0, quantity - reserved),
      reserved,
      quantity,
    };
  });
}
