type WishlistClient = { from: (table: string) => any };

export type SaveWishlistItemResult = { status: 'saved' } | { status: 'not_found' } | { status: 'failure' };

export async function saveWishlistItem(client: WishlistClient, input: { customerId: string; slug: string; locale?: 'en' | 'ar' | 'fr' }): Promise<SaveWishlistItemResult> {
  try {
    const { data: product } = await client.from('products').select('id').eq('slug', input.slug).maybeSingle();
    if (!product) return { status: 'not_found' };
    const { error } = await client.from('wishlist_items').insert({ customer_id: input.customerId, product_id: product.id, locale: input.locale ?? 'en' }).onConflict('customer_id,product_id').doNothing();
    if (error) return { status: 'failure' };
    return { status: 'saved' };
  } catch {
    return { status: 'failure' };
  }
}

export type RemoveWishlistItemResult = { status: 'removed' } | { status: 'not_found' } | { status: 'failure' };

export async function removeWishlistItem(client: WishlistClient, input: { customerId: string; slug: string }): Promise<RemoveWishlistItemResult> {
  try {
    const { data: product } = await client.from('products').select('id').eq('slug', input.slug).maybeSingle();
    if (!product) return { status: 'not_found' };
    const { error } = await client.from('wishlist_items').delete().eq('customer_id', input.customerId).eq('product_id', product.id);
    if (error) return { status: 'failure' };
    return { status: 'removed' };
  } catch {
    return { status: 'failure' };
  }
}

export type MergeWishlistResult = { status: 'merged'; slugs: string[] } | { status: 'failure' };

export async function mergeWishlist(client: WishlistClient, input: { customerId: string; slugs: string[]; locale?: 'en' | 'ar' | 'fr' }): Promise<MergeWishlistResult> {
  try {
    const unique = [...new Set(input.slugs)].slice(0, 50);
    if (unique.length) {
      const { data: products } = await client.from('products').select('id').in('slug', unique);
      const rows = (products ?? []).map((product: any) => ({ customer_id: input.customerId, product_id: String(product.id), locale: input.locale ?? 'en' }));
      if (rows.length) {
        const { error } = await client.from('wishlist_items').insert(rows).onConflict('customer_id,product_id').doNothing();
        if (error) return { status: 'failure' };
      }
    }
    const { data: items } = await client.from('wishlist_items').select('products(slug)').eq('customer_id', input.customerId).order('created_at', { ascending: true });
    const slugs = (items ?? []).map((item: any) => String(item.products?.slug)).filter(Boolean);
    return { status: 'merged', slugs };
  } catch {
    return { status: 'failure' };
  }
}
