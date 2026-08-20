export function buildGiftCardPurchasePayload(input: { purchaseId: string; amountMinor: number; origin: string; locale: 'en' | 'ar' | 'fr' }) {
  const origin = input.origin.replace(/\/$/, '');
  const reference = `GC-${input.purchaseId}`;
  return {
    amountMinor: input.amountMinor,
    orderReference: reference,
    specialReference: `giftcard:${input.purchaseId}`,
    notificationUrl: `${origin}/api/webhooks/paymob`,
    redirectionUrl: `${origin}/gift-cards/result?reference=${encodeURIComponent(reference)}&locale=${input.locale}`,
  };
}
