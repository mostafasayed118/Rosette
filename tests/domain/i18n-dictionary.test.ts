import { describe, expect, it } from 'vitest';
import { messages } from '@/features/i18n/dictionaries';

describe('i18n dictionaries', () => {
  it('keeps every locale a superset of the English keys', () => {
    const enKeys = Object.keys(messages.en).sort();
    for (const locale of ['ar', 'fr'] as const) {
      const keys = Object.keys(messages[locale]).sort();
      expect(keys).toEqual(expect.arrayContaining(enKeys));
    }
  });

  it('defines every subscription* key in en, ar and fr', () => {
    const keys = ['subscriptionsTitle', 'subscriptionsLede', 'subscriptionPlan', 'subscriptionManage', 'subscriptionProgress', 'subscriptionNextDelivery', 'subscriptionsEmpty', 'subscriptionCheckoutTitle', 'subscriptionRecipientMe', 'subscriptionRecipientOther', 'subscriptionFrequency', 'subscriptionBundleSize', 'subscriptionFirstDelivery', 'subscriptionGiftMessage', 'subscriptionConfirmPurchase'];
    for (const k of keys) {
      expect(messages.en[k], `en.${k}`).toBeTruthy();
      expect(messages.ar[k], `ar.${k}`).toBeTruthy();
      expect(messages.fr[k], `fr.${k}`).toBeTruthy();
    }
  });
});
