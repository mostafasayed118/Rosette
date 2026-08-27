export type ChangeRequestDiff = {
  delivery_date?: string;
  delivery_window?: string;
  recipient_name?: string;
  recipient_phone?: string;
  delivery_address?: string;
  items?: Array<{ id: string; quantity?: number; gift_message?: string }>;
};

const GROUP_OWNED_FIELD_KEYS = ['delivery_date', 'delivery_window', 'recipient_name', 'recipient_phone', 'delivery_address'] as const;

export function diffTouchesGroupOwnedField(diff: ChangeRequestDiff): boolean {
  return GROUP_OWNED_FIELD_KEYS.some((key) => diff[key] !== undefined);
}

export type ChangeEligibility = 'ok' | 'not_found' | 'not_changeable' | 'request_pending';

const FIELD_KEYS = ['delivery_date', 'delivery_window', 'recipient_name', 'recipient_phone', 'delivery_address'] as const;
const ITEM_KEYS = ['id', 'quantity', 'gift_message'] as const;

export function canRequestChange(order: { fulfillmentStatus: string; paymentStatus: string; hasPendingRequest: boolean } | null): ChangeEligibility {
  if (!order) return 'not_found';
  if (order.hasPendingRequest) return 'request_pending';
  if (order.fulfillmentStatus === 'cancelled' || order.fulfillmentStatus === 'delivered') return 'not_changeable';
  if (order.paymentStatus === 'refunded') return 'not_changeable';
  return 'ok';
}

export function requiresReview(order: { fulfillmentStatus: string; paymentStatus: string }): boolean {
  return order.paymentStatus === 'paid' || order.fulfillmentStatus !== 'confirmed';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function cleanString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

export function parseChangeRequestDiff(value: unknown): { ok: true; diff: ChangeRequestDiff } | { ok: false; error: string } {
  if (!isRecord(value)) return { ok: false, error: 'invalid' };
  for (const key of Object.keys(value)) {
    if (!(FIELD_KEYS as readonly string[]).includes(key) && key !== 'items') return { ok: false, error: 'invalid' };
  }
  const diff: ChangeRequestDiff = {};
  for (const key of FIELD_KEYS) {
    if (value[key] !== undefined) {
      const cleaned = cleanString(value[key]);
      if (!cleaned) return { ok: false, error: 'invalid' };
      if (key === 'delivery_date' && !/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) return { ok: false, error: 'invalid_date' };
      (diff as Record<string, string>)[key] = cleaned;
    }
  }
  if (value.items !== undefined) {
    if (!Array.isArray(value.items)) return { ok: false, error: 'invalid' };
    const items: NonNullable<ChangeRequestDiff['items']> = [];
    for (const raw of value.items) {
      if (!isRecord(raw)) return { ok: false, error: 'invalid' };
      for (const key of Object.keys(raw)) {
        if (!(ITEM_KEYS as readonly string[]).includes(key)) return { ok: false, error: 'invalid' };
      }
      const id = cleanString(raw.id);
      if (!id) return { ok: false, error: 'invalid' };
      const entry: { id: string; quantity?: number; gift_message?: string } = { id };
      if (raw.quantity !== undefined) {
        if (typeof raw.quantity !== 'number' || !Number.isInteger(raw.quantity) || raw.quantity < 1) return { ok: false, error: 'invalid_quantity' };
        entry.quantity = raw.quantity;
      }
      if (raw.gift_message !== undefined) {
        // An empty string is a valid value: it clears the message.
        if (typeof raw.gift_message !== 'string') return { ok: false, error: 'invalid' };
        entry.gift_message = raw.gift_message.trim();
      }
      if (entry.quantity === undefined && entry.gift_message === undefined) return { ok: false, error: 'invalid' };
      items.push(entry);
    }
    diff.items = items;
  }
  if (Object.keys(diff).length === 0) return { ok: false, error: 'empty_diff' };
  return { ok: true, diff };
}

export type ApplyChangesResult =
  | { ok: true; fields: ChangeRequestDiff; items: Array<{ id: string; unit_price_minor: number; quantity: number; gift_message: string }>; subtotalMinor: number; totalMinor: number; deltaMinor: number }
  | { ok: false; reason: string };

export function applyChanges(
  order: { subtotal_minor: number; delivery_fee_minor: number; discount_minor: number | null; total_minor: number },
  items: Array<{ id: string; unit_price_minor: number; quantity: number; gift_message: string }>,
  diff: ChangeRequestDiff,
): ApplyChangesResult {
  const fields: ChangeRequestDiff = {};
  for (const key of ['delivery_date', 'delivery_window', 'recipient_name', 'recipient_phone', 'delivery_address'] as const) {
    if (diff[key] !== undefined) fields[key] = diff[key];
  }
  const updated = items.map((item) => ({ ...item }));
  for (const change of diff.items ?? []) {
    const target = updated.find((item) => item.id === change.id);
    if (!target) return { ok: false, reason: 'unknown_item' };
    if (change.quantity !== undefined) {
      if (typeof change.quantity !== 'number' || !Number.isInteger(change.quantity) || change.quantity < 1) return { ok: false, reason: 'invalid_quantity' };
      target.quantity = change.quantity;
    }
    if (change.gift_message !== undefined) target.gift_message = change.gift_message.trim();
  }
  const subtotalMinor = updated.reduce((sum, item) => sum + item.unit_price_minor * item.quantity, 0);
  const totalMinor = subtotalMinor + order.delivery_fee_minor - (order.discount_minor ?? 0);
  const deltaMinor = totalMinor - order.total_minor;
  return { ok: true, fields, items: updated, subtotalMinor, totalMinor, deltaMinor };
}
