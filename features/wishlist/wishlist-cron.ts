import { evaluateWishlistWatch, currentPriceMinor, currentAvailableStock, type PriceWatchProduct } from './price-watch';
import { sendWishlistEmail, type WishlistEmailType } from './email';

type CronClient = { from: (table: string) => any };

export type WishlistCronSummary = { checked: number; sent: number; failed: number };

const select = 'id,customer_id,last_price_minor,last_available_stock,locale,profiles(email),products(id,slug,name_en,price_minor,product_variants(id,price_delta_minor,active,inventory(quantity,reserved_quantity)))';

export async function runWishlistCron(
  client: CronClient,
  deps: { origin: string; send?: typeof sendWishlistEmail },
): Promise<WishlistCronSummary> {
  const send = deps.send ?? sendWishlistEmail;
  const summary: WishlistCronSummary = { checked: 0, sent: 0, failed: 0 };
  const { data } = await client.from('wishlist_items').select(select);
  const rows = (data ?? []) as Array<Record<string, any>>;

  for (const row of rows) {
    const product = row.products as Record<string, any> | null;
    if (!product) continue;
    const variants: PriceWatchProduct['variants'] = (product.product_variants ?? []).map((variant: any) => ({
      priceDeltaMinor: Number(variant.price_delta_minor),
      active: variant.active === true,
      inventory: Array.isArray(variant.inventory) ? variant.inventory.map((item: any) => ({ quantity: Number(item.quantity), reserved_quantity: Number(item.reserved_quantity) })) : undefined,
    }));
    const watchProduct: PriceWatchProduct = { priceMinor: Number(product.price_minor), variants };
    const watch = evaluateWishlistWatch({ product: watchProduct, lastPriceMinor: Number(row.last_price_minor), lastAvailableStock: Number(row.last_available_stock) });
    const price = currentPriceMinor(watchProduct);
    const stock = currentAvailableStock(watchProduct);

    await client.from('wishlist_items').update({ last_price_minor: price, last_available_stock: stock }).eq('id', String(row.id));
    summary.checked += 1;
    if (watch.type === 'none') continue;

    const profile = row.profiles as { email?: string | null } | null;
    if (!profile?.email) { summary.failed += 1; continue; }
    const locale = row.locale === 'ar' || row.locale === 'fr' ? row.locale : 'en';
    const type: WishlistEmailType = watch.type === 'price_drop' || watch.type === 'price_drop_and_back_in_stock' ? 'wishlist_price_drop' : 'wishlist_back_in_stock';
    try {
      await send({
        to: profile.email,
        locale,
        type,
        productName: String(product.name_en ?? 'item'),
        priceMinor: watch.type === 'price_drop' || watch.type === 'price_drop_and_back_in_stock' ? watch.newMinor : undefined,
        productUrl: `${deps.origin.replace(/\/$/, '')}/en/cairo/shop/${String(product.slug)}`,
      });
      summary.sent += 1;
    } catch {
      summary.failed += 1;
    }
  }
  return summary;
}
