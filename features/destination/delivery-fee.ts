import { getCity } from './data';

/** Legacy flat fee (minor units) used when no Supabase rule applies. */
export const FLAT_SAME_DAY_FEE_MINOR = 1500;
export const FLAT_NEXT_DAY_FEE_MINOR = 2500;

export function estimateDeliveryFeeMinor(cityCode: string | null | undefined): number | null {
  if (!cityCode) return null;
  const city = getCity(cityCode);
  if (!city) return null;
  return city.sameDay ? FLAT_SAME_DAY_FEE_MINOR : FLAT_NEXT_DAY_FEE_MINOR;
}