export type PersonalizationEvent = 'personalization_impression' | 'personalization_click';

export function trackPersonalization(
  _event: PersonalizationEvent,
  _payload: Record<string, unknown>,
): void {
  // no-op stub, logs in server route
}
