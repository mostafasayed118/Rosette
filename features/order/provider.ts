import { getOptionalServerEnv } from '@/lib/server-env';
import { selectDataSource } from '@/features/commerce/provider-selection';
import { createLocalOrder } from './local-repository';
import { supabaseOrderRepository } from './supabase-repository';
import type { OrderRepository } from './types';

const localOrderRepository: OrderRepository = {
  async createPending(input) {
    const result = createLocalOrder({
      cart: input.cart,
      destination: input.destination,
      recipient: { name: input.checkout.recipientName, phone: input.checkout.recipientPhone },
      sender: { name: input.checkout.senderName, email: input.checkout.senderEmail },
      delivery: { address: input.checkout.address, date: input.checkout.deliveryDate, window: input.checkout.deliveryWindow },
      paymentMethod: input.checkout.paymentMethod,
      simulatePaymentFailure: false,
    });
    if (!result.ok) return { ok: false, error: result.error === 'empty_cart' ? 'empty_cart' : 'invalid' };
    return { ok: true, value: { id: result.value.id, displayNumber: result.value.displayNumber, totalMinor: result.value.totals.total, paymentStatus: 'pending', fulfillmentStatus: 'confirmed' } };
  },
  async getPublicOrder(id, verification) {
    const { getLocalOrder } = await import('./local-repository');
    const order = getLocalOrder(id);
    if (!order) return null;
    if (verification.phone && order.recipient.phone !== verification.phone) return null;
    if (verification.email && order.sender.email !== verification.email) return null;
    return order;
  },
};

export function getOrderRepository(): OrderRepository {
  const url = getOptionalServerEnv('NEXT_PUBLIC_SUPABASE_URL');
  const serviceKey = getOptionalServerEnv('SUPABASE_SERVICE_ROLE_KEY');
  return selectDataSource({ url, key: serviceKey }) === 'supabase' ? supabaseOrderRepository : localOrderRepository;
}
