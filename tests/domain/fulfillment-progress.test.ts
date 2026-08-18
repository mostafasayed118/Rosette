import { describe, expect, it } from 'vitest';
import { FULFILLMENT_STEPS, FULFILLMENT_STEP_KEYS, fulfillmentStepIndex } from '@/features/tracking/fulfillment-progress';

describe('fulfillment progress', () => {
  it('lists the delivery journey in order', () => {
    expect(FULFILLMENT_STEPS).toEqual(['confirmed', 'preparing', 'ready_for_delivery', 'out_for_delivery', 'delivered']);
  });

  it('maps each step to an i18n key', () => {
    expect(FULFILLMENT_STEP_KEYS.delivered).toBe('statusDelivered');
    expect(FULFILLMENT_STEP_KEYS.ready_for_delivery).toBe('statusReadyForDelivery');
  });

  it('returns the current step index for a normal status', () => {
    expect(fulfillmentStepIndex('confirmed')).toBe(0);
    expect(fulfillmentStepIndex('ready_for_delivery')).toBe(2);
  });

  it('returns the steps length for delivered (all steps complete)', () => {
    expect(fulfillmentStepIndex('delivered')).toBe(5);
  });

  it('returns -1 for cancelled', () => {
    expect(fulfillmentStepIndex('cancelled')).toBe(-1);
  });
});
