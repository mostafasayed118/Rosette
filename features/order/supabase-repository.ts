import { randomUUID } from 'node:crypto';
import { calculateCartTotals } from '@/features/cart/pricing';
import { applyPromoToOrderTotals, validatePromo } from '@/features/promo/apply';
import { fetchPromo } from '@/features/promo/repository';
import { applyDeliveryRule, fetchDeliveryRule } from './delivery-rules';
import { buildOrderInsertRow } from './order-insert';
import { holdGiftCardForOrder, quoteGiftCardForOrder } from '@/features/gift-cards/service';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { CartLine } from '@/features/cart/types';
import type { OrderRepository, CreatePendingOrderInput, Order, PendingOrder, Result, OrderCreateError } from './types';

type ProductRow = { id: string; slug: string; name_en: string; name_ar: string; name_fr?: string; price_minor: number; add_ons: Array<{ id: string; name_en: string; price_minor: number }>; product_variants: Array<{ id: string; name_en: string; price_delta_minor: number }> };

function displayNumber() {
  // Random suffix keeps concurrent checkouts from colliding on the unique
  // display_number column (Date.now() alone repeats within the same ms).
  const random = randomUUID().replace(/-/g, '').slice(0, 4).toUpperCase();
  return `RO-${Date.now().toString(36).toUpperCase()}-${random}`;
}

async function authoritativeLines(supabase: ReturnType<typeof getAdminSupabase>, lines: CartLine[]) {
  const slugs = [...new Set(lines.map((line) => line.productSlug))];
  const { data, error } = await supabase.from('products').select('id,slug,name_en,name_ar,name_fr,price_minor,add_ons,product_variants(name_en,price_delta_minor)').in('slug', slugs).eq('active', true);
  if (error) throw error;
  const products = (data ?? []) as unknown as ProductRow[];
  if (products.length !== slugs.length) return null;
  return lines.map((line) => {
    const product = products.find((candidate) => candidate.slug === line.productSlug);
    if (!product) return null;
    const variant = product.product_variants.find((candidate) => candidate.name_en === line.variantName);
    const allowedAddOns = new Map((product.add_ons ?? []).map((addOn) => [addOn.id, addOn]));
    const addOns = line.addOns.flatMap((addOn) => {
      const authoritative = allowedAddOns.get(addOn.id);
      return authoritative ? [{ id: authoritative.id, name: authoritative.name_en, price: authoritative.price_minor }] : [];
    });
    return { ...line, productName: product.name_en, productNameAr: product.name_ar, productNameFr: product.name_fr, unitPrice: product.price_minor + (variant?.price_delta_minor ?? 0), variantId: line.variantId ?? variant?.id, addOns };
  });
}

export const supabaseOrderRepository: OrderRepository = {
  async createPending(input: CreatePendingOrderInput): Promise<Result<PendingOrder, OrderCreateError>> {
    if (!input.cart.lines.length) return { ok: false, error: 'empty_cart' };
    try {
      const supabase = getAdminSupabase();
      const lines = await authoritativeLines(supabase, input.cart.lines);
      if (!lines || lines.some((line) => line === null)) return { ok: false, error: 'invalid' };
      const safeLines = lines as CartLine[];
      if (safeLines.some((line) => !line.variantId)) return { ok: false, error: 'invalid' };
      const subtotal = calculateCartTotals(safeLines, 0).subtotal;
      const rule = await fetchDeliveryRule(supabase, input.destination.cityCode);
      const { feeMinor, belowMinimum } = applyDeliveryRule(rule, subtotal);
      if (belowMinimum) return { ok: false, error: 'invalid' };
      let totals = calculateCartTotals(safeLines, feeMinor);
      let discountMinor = 0;
      let promoCode: string | null = null;
      const requestedPromo = input.checkout.promoCode?.trim();
      if (requestedPromo) {
        const promo = await fetchPromo(supabase, requestedPromo);
        const promoError = promo ? validatePromo(promo, totals.subtotal, new Date()) : 'inactive';
        if (!promo || promoError) return { ok: false, error: 'invalid_promo' };
        const withDiscount = applyPromoToOrderTotals({ subtotalMinor: totals.subtotal, deliveryFeeMinor: totals.deliveryFee }, promo);
        totals = { subtotal: withDiscount.subtotalMinor, deliveryFee: withDiscount.deliveryFeeMinor, total: withDiscount.totalMinor };
        discountMinor = withDiscount.discountMinor;
        promoCode = promo.code;
      }
      let giftCardMinor = 0;
      let giftCardId: string | null = null;
      let giftCardCodeLast4: string | null = null;
      const giftCardCode = input.checkout.giftCardCode?.trim();
      if (giftCardCode) {
        const quote = await quoteGiftCardForOrder(supabase, { code: giftCardCode, orderTotalMinor: totals.total });
        if (!quote.ok) return { ok: false, error: 'invalid_gift_card' };
        giftCardMinor = quote.value.amountAppliedMinor;
        giftCardId = quote.value.giftCardId;
        giftCardCodeLast4 = quote.value.codeLast4;
        totals = { ...totals, total: quote.value.remainingTotalMinor };
      }
      const number = displayNumber();
      const publicToken = randomUUID();
      const { data: order, error } = await supabase.from('orders').insert(buildOrderInsertRow({
        number,
        publicToken,
        customerId: input.customerId,
        customerEmail: input.checkout.senderEmail,
        customerPhone: input.checkout.recipientPhone,
        recipientName: input.checkout.recipientName,
        recipientPhone: input.checkout.recipientPhone,
        deliveryAddress: input.checkout.address,
        deliveryCityCode: input.destination.cityCode,
        deliveryDate: input.checkout.deliveryDate,
        deliveryWindow: input.checkout.deliveryWindow,
        locale: input.locale,
        subtotalMinor: totals.subtotal,
        deliveryFeeMinor: totals.deliveryFee,
        discountMinor,
        promoCode,
        totalMinor: totals.total,
        giftCardMinor,
        giftCardId,
        giftCardCodeLast4,
      })).select('id,display_number,public_token,total_minor').single();
      if (error || !order) return { ok: false, error: 'unavailable' };
      const { error: itemError } = await supabase.from('order_items').insert(safeLines.map((line) => ({
        order_id: order.id,
        product_id: null,
        variant_id: line.variantId,
        product_slug: line.productSlug,
        product_name_en: line.productName,
        product_name_ar: line.productNameAr ?? '',
        product_name_fr: (line as { productNameFr?: string }).productNameFr ?? '',
        unit_price_minor: line.unitPrice,
        quantity: line.quantity,
        add_ons: line.addOns,
        gift_message: line.message,
      })));
      if (itemError) { await supabase.from('orders').delete().eq('id', order.id); return { ok: false, error: 'unavailable' }; }
      let giftCardHoldId: string | null = null;
      if (giftCardCode && giftCardMinor > 0) {
        const hold = await holdGiftCardForOrder(supabase, { code: giftCardCode, orderId: order.id, amountMinor: giftCardMinor });
        if (!hold.ok) { await supabase.from('orders').delete().eq('id', order.id); return { ok: false, error: 'invalid_gift_card' }; }
        giftCardHoldId = hold.holdId;
        const { error: holdUpdateError } = await supabase.from('orders').update({ gift_card_hold_id: giftCardHoldId }).eq('id', order.id);
        if (holdUpdateError) { await supabase.rpc('release_gift_card_hold', { p_hold_id: giftCardHoldId, p_idempotency_key: `gift-card-release:${order.id}` }); await supabase.from('orders').delete().eq('id', order.id); return { ok: false, error: 'unavailable' }; }
      }
      const { error: reservationError } = await supabase.rpc('reserve_order_inventory', { p_order_id: order.id, p_items: safeLines.map((line) => ({ variant_id: line.variantId, quantity: line.quantity })) });
      if (reservationError) {
        if (giftCardHoldId) await supabase.rpc('release_gift_card_hold', { p_hold_id: giftCardHoldId, p_idempotency_key: `gift-card-release:${order.id}` });
        await supabase.from('orders').delete().eq('id', order.id);
        return { ok: false, error: reservationError.message.includes('INSUFFICIENT_STOCK') ? 'invalid' : 'unavailable' };
      }
      if (promoCode) await supabase.rpc('increment_promo_usage', { p_code: promoCode });
      return { ok: true, value: { id: order.id, displayNumber: order.display_number, totalMinor: order.total_minor, subtotalMinor: totals.subtotal, deliveryFeeMinor: totals.deliveryFee, discountMinor, giftCardMinor, giftCardId, giftCardHoldId, giftCardCodeLast4, publicToken: order.public_token, paymentStatus: 'pending', fulfillmentStatus: 'confirmed' } };
    } catch {
      return { ok: false, error: 'unavailable' };
    }
  },

  async getPublicOrder(id: string, verification): Promise<Order | null> {
    const supabase = getAdminSupabase();
    let query = supabase.from('orders').select('*,order_items(*)').eq('id', id);
    if (verification.publicToken) query = query.eq('public_token', verification.publicToken);
    if (verification.phone) query = query.eq('recipient_phone', verification.phone);
    if (verification.email) query = query.eq('customer_email', verification.email);
    const { data } = await query.maybeSingle();
    return (data as Order | null) ?? null;
  },
};
