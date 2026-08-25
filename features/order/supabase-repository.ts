import { calculateCartTotals } from '@/features/cart/pricing';
import { applyPromoToOrderTotals, validatePromo } from '@/features/promo/apply';
import { fetchPromo } from '@/features/promo/repository';
import { applyDeliveryRule, fetchDeliveryRule } from './delivery-rules';
import { quoteGiftCardForOrder } from '@/features/gift-cards/service';
import { hashGiftCardCode } from '@/features/gift-cards/crypto';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { getRequiredServerEnv } from '@/lib/server-env';
import type { CartLine } from '@/features/cart/types';
import type { OrderRepository, CreatePendingOrderInput, Order, PendingOrder, Result, OrderCreateError } from './types';

type ProductRow = { id: string; slug: string; name_en: string; name_ar: string; name_fr?: string; price_minor: number; add_ons: Array<{ id: string; name_en: string; price_minor: number }>; product_variants: Array<{ id: string; name_en: string; price_delta_minor: number }> };

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

type RpcResponse = { order: { id: string; display_number: string; public_token: string; total_minor: number; subtotal_minor: number; delivery_fee_minor: number; discount_minor: number; gift_card_minor: number; gift_card_id: string | null; gift_card_hold_id: string | null; gift_card_code_last4: string | null; payment_status: 'pending' | 'paid'; fulfillment_status: 'confirmed' }; gift_card_hold_id: string | null; zero_total_redeemed: boolean };

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
      let giftCardCodeHash: string | null = null;
      const giftCardCode = input.checkout.giftCardCode?.trim();
      if (giftCardCode) {
        const quote = await quoteGiftCardForOrder(supabase, { code: giftCardCode, orderTotalMinor: totals.total });
        if (!quote.ok) return { ok: false, error: 'invalid_gift_card' };
        giftCardMinor = quote.value.amountAppliedMinor;
        giftCardId = quote.value.giftCardId;
        giftCardCodeLast4 = quote.value.codeLast4;
        giftCardCodeHash = hashGiftCardCode(giftCardCode, getRequiredServerEnv('GIFT_CARD_SECRET'));
        totals = { ...totals, total: quote.value.remainingTotalMinor };
      }
      const { data, error } = await supabase.rpc('create_pending_order', {
        p_lines: safeLines.map((line) => ({
          variantId: line.variantId,
          productSlug: line.productSlug,
          productName: line.productName,
          productNameAr: line.productNameAr ?? '',
          productNameFr: (line as { productNameFr?: string }).productNameFr ?? '',
          unitPrice: line.unitPrice,
          quantity: line.quantity,
          addOns: line.addOns,
          message: line.message,
        })),
        p_destination: { cityCode: input.destination.cityCode },
        p_checkout: {
          customerEmail: input.checkout.senderEmail,
          customerPhone: input.checkout.recipientPhone,
          recipientName: input.checkout.recipientName,
          recipientPhone: input.checkout.recipientPhone,
          deliveryAddress: input.checkout.address,
          deliveryDate: input.checkout.deliveryDate,
          deliveryWindow: input.checkout.deliveryWindow,
          locale: input.locale,
          giftCardCodeHash,
          giftCardId,
          giftCardCodeLast4,
        },
        p_customer_id: input.customerId ?? null,
        p_subtotal_minor: totals.subtotal,
        p_delivery_fee_minor: totals.deliveryFee,
        p_discount_minor: discountMinor,
        p_total_minor: totals.total,
        p_promo_code: promoCode,
        p_gift_card_minor: giftCardMinor,
      });
      if (error || !data) return { ok: false, error: 'unavailable' };
      const rpc = data as unknown as RpcResponse;
      return { ok: true, value: { id: rpc.order.id, displayNumber: rpc.order.display_number, totalMinor: rpc.order.total_minor, subtotalMinor: rpc.order.subtotal_minor, deliveryFeeMinor: rpc.order.delivery_fee_minor, discountMinor: rpc.order.discount_minor, giftCardMinor: rpc.order.gift_card_minor, giftCardId: rpc.order.gift_card_id, giftCardHoldId: rpc.order.gift_card_hold_id, giftCardCodeLast4: rpc.order.gift_card_code_last4, publicToken: rpc.order.public_token, paymentStatus: 'pending', fulfillmentStatus: 'confirmed' } };
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
