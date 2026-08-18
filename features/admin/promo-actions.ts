import type { AdminIdentity } from './authorization';

export type PromoInput = { code: string; type: 'percent' | 'fixed'; percentOff: number | null; valueMinor: number | null; minimumOrderMinor: number; startsAt: string | null; expiresAt: string | null; maxUses: number; active: boolean };

export type PromoSaveResult = 'saved' | 'forbidden' | 'validation' | 'failure';
export type PromoCreateResult = 'created' | 'forbidden' | 'validation' | 'code_taken' | 'failure';

type PromoClient = { from: (table: string) => any };

const CODE_PATTERN = /^[A-Z0-9][A-Z0-9-]*$/;

function canEdit(identity: AdminIdentity): boolean {
  return identity.role === 'admin' || identity.role === 'operator';
}

function normalize(input: PromoInput): PromoInput {
  return { ...input, code: input.code.trim().toUpperCase() };
}

export function validatePromoInput(input: PromoInput): string | null {
  if (!CODE_PATTERN.test(input.code.trim().toUpperCase())) return 'invalid_code';
  if (input.type !== 'percent' && input.type !== 'fixed') return 'invalid_type';
  if (input.type === 'percent') {
    if (input.valueMinor !== null || input.percentOff === null || !Number.isInteger(input.percentOff) || input.percentOff < 0 || input.percentOff > 100) return 'invalid_percent';
  } else {
    if (input.percentOff !== null || input.valueMinor === null || !Number.isInteger(input.valueMinor) || input.valueMinor < 0) return 'invalid_value';
  }
  if (!Number.isInteger(input.minimumOrderMinor) || input.minimumOrderMinor < 0) return 'invalid_minimum';
  if (!Number.isInteger(input.maxUses) || input.maxUses < 0) return 'invalid_max_uses';
  if (input.startsAt && input.expiresAt && input.startsAt >= input.expiresAt) return 'invalid_dates';
  return null;
}

function toRow(input: PromoInput) {
  return {
    code: input.code.trim().toUpperCase(),
    type: input.type,
    percent_off: input.type === 'percent' ? input.percentOff : null,
    value_minor: input.type === 'fixed' ? input.valueMinor : null,
    minimum_order_minor: input.minimumOrderMinor,
    starts_at: input.startsAt ?? null,
    expires_at: input.expiresAt ?? null,
    max_uses: input.maxUses,
    active: input.active,
  };
}

export async function savePromoCode(client: PromoClient, identity: AdminIdentity, input: PromoInput): Promise<PromoSaveResult> {
  if (!canEdit(identity)) return 'forbidden';
  const normalized = normalize(input);
  if (validatePromoInput(normalized)) return 'validation';
  try {
    const { error } = await client.from('promo_codes').update(toRow(normalized)).eq('code', normalized.code);
    if (error) return 'failure';
    await client.from('admin_audit_logs').insert({ actor_id: identity.userId, action: 'update_promo', target_type: 'promo', target_id: normalized.code, metadata: { code: normalized.code } });
    return 'saved';
  } catch {
    return 'failure';
  }
}

export async function createPromoCode(client: PromoClient, identity: AdminIdentity, input: PromoInput): Promise<PromoCreateResult> {
  if (!canEdit(identity)) return 'forbidden';
  const normalized = normalize(input);
  if (validatePromoInput(normalized)) return 'validation';
  try {
    const { data: existing } = await client.from('promo_codes').select('code').eq('code', normalized.code).maybeSingle();
    if (existing) return 'code_taken';
    const { error } = await client.from('promo_codes').insert(toRow(normalized));
    if (error) return 'failure';
    await client.from('admin_audit_logs').insert({ actor_id: identity.userId, action: 'create_promo', target_type: 'promo', target_id: normalized.code, metadata: { code: normalized.code } });
    return 'created';
  } catch {
    return 'failure';
  }
}
