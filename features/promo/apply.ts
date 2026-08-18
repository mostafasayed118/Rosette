export type PromoRow = {
  code: string;
  type: 'percent' | 'fixed';
  percent_off: number | null;
  value_minor: number | null;
  minimum_order_minor: number;
  starts_at: string | null;
  expires_at: string | null;
  max_uses: number;
  used_count: number;
  active: boolean;
};

export type PromoError = 'inactive' | 'not_started' | 'expired' | 'max_uses' | 'below_minimum';

export function validatePromo(promo: PromoRow, subtotalMinor: number, now: Date): PromoError | null {
  if (!promo.active) return 'inactive';
  if (promo.starts_at && new Date(promo.starts_at).getTime() > now.getTime()) return 'not_started';
  if (promo.expires_at && new Date(promo.expires_at).getTime() < now.getTime()) return 'expired';
  if (promo.max_uses > 0 && promo.used_count >= promo.max_uses) return 'max_uses';
  if (subtotalMinor < promo.minimum_order_minor) return 'below_minimum';
  return null;
}

export function computeDiscount(promo: PromoRow, subtotalMinor: number): { discountMinor: number; totalMinor: number } {
  const raw = promo.type === 'percent' ? Math.round((subtotalMinor * (promo.percent_off ?? 0)) / 100) : (promo.value_minor ?? 0);
  const discountMinor = Math.min(raw, subtotalMinor);
  return { discountMinor, totalMinor: subtotalMinor - discountMinor };
}

export function applyPromoToOrderTotals(totals: { subtotalMinor: number; deliveryFeeMinor: number }, promo: PromoRow) {
  const { discountMinor } = computeDiscount(promo, totals.subtotalMinor);
  return { ...totals, discountMinor, totalMinor: totals.subtotalMinor + totals.deliveryFeeMinor - discountMinor };
}
