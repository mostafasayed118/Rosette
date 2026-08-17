export function validateOrderRequest(input: { cart?: { lines?: unknown[] }; total?: unknown }) {
  if (!input.cart?.lines?.length) return { ok: false as const, error: 'empty_cart' as const };
  if ('total' in input) return { ok: false as const, error: 'client_total_not_allowed' as const };
  return { ok: true as const };
}
