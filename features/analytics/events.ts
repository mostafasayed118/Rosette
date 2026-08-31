export const ANALYTICS_EVENTS = [
  'product_view',
  'add_to_cart',
  'checkout_start',
  'checkout_complete',
  'order_placed',
  'search_performed',
  'personalization_impression',
  'personalization_click',
] as const;

export type AnalyticsEventName = (typeof ANALYTICS_EVENTS)[number];

export type AnalyticsEventPayload = {
  event: AnalyticsEventName;
  path?: string;
  locale?: 'en' | 'ar' | 'fr';
  productSlug?: string;
  metadata?: Record<string, string | number | boolean | null>;
};

/**
 * Fire-and-forget first-party analytics. It never blocks a user action and it
 * deliberately sends only a small allow-listed payload with no email, phone,
 * address, or free-form message fields.
 */
export function trackEvent(payload: AnalyticsEventPayload): void {
  if (typeof window === 'undefined') return;
  const body = JSON.stringify({
    event: payload.event,
    path: payload.path ?? window.location.pathname,
    locale: payload.locale,
    productSlug: payload.productSlug,
    metadata: payload.metadata,
  });
  try {
    if (navigator.sendBeacon) {
      navigator.sendBeacon('/api/analytics/events', new Blob([body], { type: 'application/json' }));
      return;
    }
  } catch {
    // Fall through to fetch for browsers that reject sendBeacon payloads.
  }
  void fetch('/api/analytics/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    keepalive: true,
  }).catch(() => undefined);
}
