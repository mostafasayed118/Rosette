import { describe, expect, it } from 'vitest';
import { buildPaymobIntentionPayload } from '@/features/payment/paymob-client';

describe('Paymob intention payload', () => {
  it('uses minor-unit EGP amount and the internal order reference', () => {
    expect(buildPaymobIntentionPayload({
      amountMinor: 18500,
      orderReference: 'RO-123',
      integrationId: 456,
      customer: { email: 'buyer@example.com', phone: '+201000000000', name: 'Buyer' },
      notificationUrl: 'https://example.com/api/webhooks/paymob',
      redirectionUrl: 'https://example.com/orders/order-1',
    })).toMatchObject({
      amount: 18500,
      currency: 'EGP',
      payment_methods: [456],
      special_reference: 'RO-123',
      billing_data: { email: 'buyer@example.com', phone_number: '+201000000000', first_name: 'Buyer' },
    });
  });
});
