export const CITY_CODE_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export type RuleFields = { feeMinor: number; minimumOrderMinor: number; cutoffHour: number };

export function validateRuleFields(input: RuleFields): string | null {
  if (!Number.isInteger(input.feeMinor) || input.feeMinor < 0) return 'invalid_fee';
  if (!Number.isInteger(input.minimumOrderMinor) || input.minimumOrderMinor < 0) return 'invalid_minimum';
  if (!Number.isInteger(input.cutoffHour) || input.cutoffHour < 0 || input.cutoffHour > 23) return 'invalid_cutoff';
  return null;
}

export type CityFields = RuleFields & { code: string; nameEn: string; nameAr: string };

export function validateCityFields(input: CityFields): string | null {
  if (!CITY_CODE_PATTERN.test(input.code)) return 'invalid_code';
  if (!input.nameEn.trim() || !input.nameAr.trim()) return 'name_required';
  return validateRuleFields(input);
}
