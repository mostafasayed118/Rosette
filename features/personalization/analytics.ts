import { trackEvent } from '@/features/analytics/events';

export type PersonalizationEvent = 'personalization_impression' | 'personalization_click';

/** The former no-op is now a first-party event adapter with no external SDK. */
export function trackPersonalization(event: PersonalizationEvent, payload: Record<string, unknown>): void {
  const productSlug = typeof payload.productSlug === 'string' ? payload.productSlug : undefined;
  const metadata = Object.fromEntries(
    Object.entries(payload)
      .filter(([key]) => key !== 'productSlug')
      .filter(([, value]) => value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')
      .map(([key, value]) => [key, value as string | number | boolean | null]),
  );
  trackEvent({ event, productSlug, metadata });
}
