import type { EmailLocale } from '@/features/notifications/email-types';

export type GiftCardAmountMode = 'fixed' | 'custom';
export type GiftCardStatus = 'active' | 'depleted' | 'expired' | 'void';
export type GiftCardPurchaseStatus = 'pending' | 'paid' | 'failed' | 'cancelled';
export type GiftCardDeliveryStatus = 'pending' | 'sent' | 'failed';
export type GiftCardTransactionType = 'issue' | 'redeem' | 'release' | 'void' | 'refund';

export type GiftCardAmount = { mode: GiftCardAmountMode; amountMinor: number };
export type GiftCardPurchaseInput = GiftCardAmount & {
  senderName: string;
  senderEmail: string;
  recipientName: string;
  recipientEmail: string;
  message: string;
  locale: EmailLocale;
};
export type GiftCardQuote = { codeLast4: string; amountAppliedMinor: number; remainingTotalMinor: number };
export type GiftCardPublicReference = { purchaseId: string; reference: string; checkoutUrl: string };
export type GiftCardTransaction = { type: GiftCardTransactionType; amountMinor: number; orderId: string | null; actorId: string | null; idempotencyKey: string; createdAt: string };
export type GiftCardMaskedRow = { id: string; codeLast4: string; initialBalanceMinor: number; balanceMinor: number; status: GiftCardStatus; recipientEmail: string | null; buyerEmail: string | null; expiresAt: string; source: 'purchase' | 'admin'; deliveryStatus: GiftCardDeliveryStatus; createdAt: string };
