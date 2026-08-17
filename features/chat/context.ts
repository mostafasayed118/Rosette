import { getCatalogRepository } from '@/features/catalog/provider';

export async function getStoreContext(message: string) {
  const products = await getCatalogRepository().list({ search: message, sort: 'recommended' });
  return products.products.slice(0, 6).map((product) => ({ slug: product.slug, name: product.name, nameAr: product.nameAr, description: product.description, descriptionAr: product.descriptionAr, priceMinor: product.price, delivery: product.delivery, inventory: product.inventory > 0 }));
}
