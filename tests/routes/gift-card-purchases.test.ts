import { describe, expect, it } from 'vitest';
import { buildGiftCardPurchasePayload } from '@/features/gift-cards/purchase-route';

describe('gift-card purchase route payload', () => {
  it('creates the Paymob reference and callback URLs without a code', () => {
    const payload = buildGiftCardPurchasePayload({ purchaseId: 'purchase-1', amountMinor: 100000, origin: 'https://shop.example.com', locale: 'en' });
    expect(payload).toMatchObject({ amountMinor: 100000, orderReference: 'GC-purchase-1', specialReference: 'giftcard:purchase-1', notificationUrl: 'https://shop.example.com/api/webhooks/paymob' });
    expect(JSON.stringify(payload)).not.toContain('code');
  });
});
