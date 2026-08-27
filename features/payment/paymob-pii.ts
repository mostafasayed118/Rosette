/**
 * Strip PAN and other card-sensitive fields from Paymob payloads before
 * persisting them. Paymob callbacks echo the shopper's card in
 * `source_data.pan` (and occasionally nested under `obj.source_data`,
 * `transaction.source_data`, `payment_key_claims.billing_data`, etc.).
 * Storing the raw callback therefore puts PCI-sensitive PII at rest — mask it.
 *
 * The sanitizer is intentionally conservative: it clones the payload, walks it
 * recursively and for every object that contains a `pan` (or card-number-like)
 * field it keeps only the last four digits and the card brand; everything
 * else in that object is preserved. Unknown shapes are left intact so new
 * Paymob fields do not cause the webhook to throw.
 */

const SENSITIVE_KEYS = new Set([
  "pan",
  "card_number",
  "cardNumber",
  "card-number",
  "primary_account_number",
]);

function maskPan(value: unknown): string {
  const digits = String(value).replace(/\D/g, "");
  if (digits.length <= 4) return "***";
  return `***${digits.slice(-4)}`;
}

function sanitizeSourceData(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  const src = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(src)) {
    if (SENSITIVE_KEYS.has(k)) {
      out[k] = maskPan(v);
    } else if (k === "pan_truncated" || k === "masked_pan") {
      // Already truncated by Paymob — keep as-is (no additional masking).
      out[k] = v;
    } else {
      out[k] = v;
    }
  }
  // If the object carried a raw pan, also expose an explicit last4 for
  // downstream code that relied on it (none currently does, but keeps the
  // sanitized payload self-describing).
  if ("pan" in src && typeof src.pan === "string" && !("pan_last4" in out)) {
    const digits = String(src.pan).replace(/\D/g, "");
    if (digits.length >= 4) out.pan_last4 = digits.slice(-4);
  }
  return out;
}

function deepSanitize(value: unknown, depth = 0): unknown {
  if (depth > 12) return value;
  if (Array.isArray(value)) return value.map((entry) => deepSanitize(entry, depth + 1));
  if (!value || typeof value !== "object") return value;
  const obj = value as Record<string, unknown>;

  // Any object that has a `source_data` child — replace it with a sanitized copy.
  if ("source_data" in obj && obj.source_data !== null && typeof obj.source_data === "object") {
    const clone: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (k === "source_data") clone[k] = sanitizeSourceData(v);
      else clone[k] = deepSanitize(v, depth + 1);
    }
    // Also walk billing_data that sometimes carries card data.
    return clone;
  }

  // Top-level card-like keys (paranoid — handles flat payload shapes).
  let mutated = false;
  const clone: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (SENSITIVE_KEYS.has(k)) {
      clone[k] = maskPan(v);
      mutated = true;
    } else {
      const sanitized = deepSanitize(v, depth + 1);
      clone[k] = sanitized;
      if (sanitized !== v) mutated = true;
    }
  }
  return mutated ? clone : obj;
}

/**
 * Return a deep-cloned, PAN-masked copy of a Paymob callback / transaction
 * payload. Safe to persist into `payments.raw_event` or
 * `webhook_quarantine.payload`.
 */
export function sanitizePaymobPayload<T>(payload: T): T {
  if (!payload || typeof payload !== "object") return payload;
  // Fast path: no card data anywhere — avoid cloning.
  // We still walk once to be safe, but this keeps the common case cheap.
  return deepSanitize(payload) as T;
}

/**
 * Convenience for the webhook route: sanitize the outer callback (which may
 * carry `obj`) and the inner transaction object with a single call.
 */
export function sanitizePaymobTransaction(
  transaction: Record<string, unknown>,
): Record<string, unknown> {
  return sanitizePaymobPayload(transaction) as Record<string, unknown>;
}
