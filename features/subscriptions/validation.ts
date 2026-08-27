import type { Frequency, Plan } from './types';

export function validateSubscriptionCheckout(
  plan: Plan,
  input: Record<string, unknown>,
  now = new Date(),
): { ok: true; value: Record<string, unknown> } | { ok: false; error: string } {
  if (!plan.active) return { ok: false, error: 'plan_unavailable' };
  const frequency = input.frequency as Frequency;
  if (!plan.frequencies.includes(frequency)) return { ok: false, error: 'invalid_frequency' };
  const bundleSize = Number(input.bundleSize);
  if (!plan.bundlePrices.some((p) => p.deliveries === bundleSize)) return { ok: false, error: 'invalid_bundle_size' };
  if (!input.recipientName || !input.recipientPhone || !input.deliveryAddress || !input.cityCode || !input.deliveryWindow || !input.deliveryDate) {
    return { ok: false, error: 'incomplete_destination' };
  }
  const date = new Date(`${input.deliveryDate}T00:00:00Z`);
  const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  if (date.getTime() < todayStart.getTime() + 86_400_000) return { ok: false, error: 'lead_time' };
  return { ok: true, value: { frequency, bundleSize, ...input, priceMinor: plan.bundlePrices.find((p) => p.deliveries === bundleSize)!.priceMinor } };
}
