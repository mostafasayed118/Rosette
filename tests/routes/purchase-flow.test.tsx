import { describe, expect, it } from 'vitest';
import { localCatalogRepository } from '@/features/catalog/repository';
import { addLine } from '@/features/cart/cart-utils';
import { createLocalOrder } from '@/features/order/repository';
import type { Cart } from '@/features/cart/types';

describe('local purchase flow', () => {
  it('moves from a catalog product to a confirmed demo order', async () => {
    const page = await localCatalogRepository.list({ search: 'rose' });
    const product = page.products[0];
    expect(product?.slug).toBe('rose-hour');
    if (!product) throw new Error('expected sample product');
    const cart: Cart = addLine({ lines: [] }, { id: 'rose-hour-classic', productSlug: product.slug, productName: product.name, tone: product.tone, unitPrice: product.price, quantity: 1, variantName: 'Classic', addOns: [], message: 'A bright day for you', deliveryDate: '2026-08-20' });
    const result = createLocalOrder({ cart, destination: { countryCode: 'EG', cityCode: 'alexandria' }, recipient: { name: 'Maya', phone: '01000000000' }, sender: { name: 'Nour', email: 'nour@example.com' }, delivery: { address: '12 Garden Street', date: '2026-08-20', window: '12-3' }, paymentMethod: 'demo-card', simulatePaymentFailure: false });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.status).toBe('confirmed');
  });
});
