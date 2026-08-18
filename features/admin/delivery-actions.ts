import type { AdminIdentity } from './authorization';
import { validateRuleFields, validateCityFields, type CityFields, type RuleFields } from './delivery-validation';

export type SaveDeliveryRuleResult = 'saved' | 'forbidden' | 'validation' | 'failure';
export type CreateCityResult = 'created' | 'forbidden' | 'validation' | 'city_taken' | 'failure';

type DeliveryClient = { from: (table: string) => any };

function canEdit(identity: AdminIdentity): boolean {
  return identity.role === 'admin' || identity.role === 'operator';
}

export async function saveDeliveryRule(
  client: DeliveryClient,
  identity: AdminIdentity,
  input: RuleFields & { cityCode: string; active: boolean },
): Promise<SaveDeliveryRuleResult> {
  if (!canEdit(identity)) return 'forbidden';
  if (validateRuleFields(input)) return 'validation';
  try {
    const { data: existing } = await client.from('delivery_rules').select('city_code').eq('city_code', input.cityCode).maybeSingle();
    if (existing) {
      const { error } = await client.from('delivery_rules')
        .update({ fee_minor: input.feeMinor, minimum_order_minor: input.minimumOrderMinor, cutoff_hour: input.cutoffHour, active: input.active })
        .eq('city_code', input.cityCode);
      if (error) return 'failure';
    } else {
      const { error } = await client.from('delivery_rules')
        .insert({ city_code: input.cityCode, fee_minor: input.feeMinor, minimum_order_minor: input.minimumOrderMinor, cutoff_hour: input.cutoffHour, active: input.active });
      if (error) return 'failure';
    }
    await client.from('admin_audit_logs').insert({
      actor_id: identity.userId, action: 'update_delivery_rule', target_type: 'delivery_rule', target_id: input.cityCode,
      metadata: { fee_minor: input.feeMinor, minimum_order_minor: input.minimumOrderMinor, cutoff_hour: input.cutoffHour, active: input.active },
    });
    return 'saved';
  } catch {
    return 'failure';
  }
}

export async function createCityWithRule(
  client: DeliveryClient,
  identity: AdminIdentity,
  input: CityFields & { sameDay: boolean },
): Promise<CreateCityResult> {
  if (!canEdit(identity)) return 'forbidden';
  if (validateCityFields(input)) return 'validation';
  try {
    const { data: existing } = await client.from('cities').select('code').eq('code', input.code).maybeSingle();
    if (existing) return 'city_taken';
    const { error: cityError } = await client.from('cities').insert({ code: input.code, name_en: input.nameEn, name_ar: input.nameAr, same_day: input.sameDay });
    if (cityError) return 'failure';
    const { error: ruleError } = await client.from('delivery_rules')
      .insert({ city_code: input.code, fee_minor: input.feeMinor, minimum_order_minor: input.minimumOrderMinor, cutoff_hour: input.cutoffHour, active: true });
    if (ruleError) return 'failure';
    await client.from('admin_audit_logs').insert({
      actor_id: identity.userId, action: 'create_city', target_type: 'city', target_id: input.code,
      metadata: { code: input.code, same_day: input.sameDay },
    });
    return 'created';
  } catch {
    return 'failure';
  }
}
