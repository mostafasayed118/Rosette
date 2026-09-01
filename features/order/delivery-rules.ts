import { estimateDeliveryFeeMinor } from '@/features/destination/delivery-fee';

export type DeliveryRule = { feeMinor: number; minimumOrderMinor: number; cutoffHour: number };

type DeliveryRuleRow = { fee_minor: number; minimum_order_minor: number; cutoff_hour: number };

/** Minimal shape of a Supabase client used for the lookup (only `from` is needed). */
type DeliveryRuleClient = { from: (table: string) => any };

/** Charged when a city has no active delivery rule (matches the legacy flat fee). */
export const DEFAULT_DELIVERY_FEE_MINOR = 1500;

export async function fetchDeliveryRule(client: DeliveryRuleClient, cityCode: string): Promise<DeliveryRule | null> {
  const { data, error } = await client
    .from('delivery_rules')
    .select('fee_minor,minimum_order_minor,cutoff_hour')
    .eq('city_code', cityCode)
    .eq('active', true)
    .maybeSingle();
  if (error || !data) return null;
  return { feeMinor: data.fee_minor, minimumOrderMinor: data.minimum_order_minor, cutoffHour: data.cutoff_hour };
}

/**
 * Single source of truth for the flat delivery fee of a city.
 * Returns the city's configured 1500/2500 fee (via `estimateDeliveryFeeMinor`,
 * which owns that rule), or the safe default when the city is unknown so server
 * and client always agree on the same number.
 */
export function resolveDeliveryFee(cityCode: string | null | undefined, subtotalMinor: number): number | null {
  const fee = estimateDeliveryFeeMinor(cityCode);
  if (fee != null) return fee;
  // Unknown city: fall back to the safe same-day default rather than drifting.
  return DEFAULT_DELIVERY_FEE_MINOR;
}

export function applyDeliveryRule(rule: DeliveryRule | null, subtotalMinor: number, fallbackFeeMinor = DEFAULT_DELIVERY_FEE_MINOR) {
  return {
    feeMinor: rule?.feeMinor ?? fallbackFeeMinor,
    belowMinimum: rule ? subtotalMinor < rule.minimumOrderMinor : false,
  };
}