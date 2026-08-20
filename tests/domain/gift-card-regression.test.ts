import { describe, expect, it } from 'vitest';
import { messages } from '@/features/i18n/dictionaries';
import { buildGiftCardPurchasePayload } from '@/features/gift-cards/purchase-route';
import { buildPaymobIntentionPayload } from '@/features/payment/paymob-client';

const keys = ['giftCardsEyebrow', 'giftCardsTitle', 'giftCardsLede', 'giftCardAmount', 'giftCardCustom', 'giftCardCustomAmount', 'giftCardSenderName', 'giftCardSenderEmail', 'giftCardRecipientName', 'giftCardRecipientEmail', 'giftCardMessage', 'buyGiftCard', 'giftCardPurchaseFailed', 'giftCardPaid', 'giftCardDeliveryHint', 'giftCardPaymentFailed', 'giftCardPaymentPending', 'giftCardDeliveryPending', 'giftCardResultTitle', 'giftCardResultLede', 'giftCardOperations', 'giftCards', 'giftCardStatus_active', 'giftCardStatus_depleted', 'giftCardStatus_expired', 'giftCardStatus_void', 'giftCardExpires', 'giftCardHistory', 'noGiftCards', 'giftCardAdminFailed', 'issueGiftCard', 'resendGiftCard', 'voidGiftCard', 'giftCardCode'];

describe('gift-card regressions', () => {
  it('defines every gift-card key in EN, AR, and FR', () => {
    for (const locale of ['en', 'ar', 'fr'] as const) for (const key of keys) expect(messages[locale][key], `${locale}.${key}`).toBeTruthy();
  });

  it('keeps gift-card and ordinary Paymob references distinct', () => {
    expect(buildGiftCardPurchasePayload({ purchaseId: 'purchase-1', amountMinor: 100000, origin: 'https://shop.example.com', locale: 'en' })).toMatchObject({ orderReference: 'GC-purchase-1', specialReference: 'giftcard:purchase-1' });
    expect(buildPaymobIntentionPayload({ amountMinor: 25000, orderReference: 'RO-123', integrationId: 1, customer: { name: 'Maya', email: 'maya@example.com', phone: '0100' }, notificationUrl: 'https://shop.example.com/api/webhooks/paymob', redirectionUrl: 'https://shop.example.com/orders/o1' })).toMatchObject({ special_reference: 'RO-123', amount: 25000 });
  });
});
