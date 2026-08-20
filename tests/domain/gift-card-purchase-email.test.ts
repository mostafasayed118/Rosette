import { describe, expect, it } from 'vitest';
import { deliverGiftCardPurchase, renderGiftCardEmail } from '@/features/gift-cards/purchase-email';

describe('gift-card purchase email', () => {
  it.each([
    ['en', 'Your digital gift card'],
    ['ar', 'بطاقة هدية'],
    ['fr', 'Votre carte cadeau'],
  ] as const)('renders the %s locale with the code and amount', (locale, title) => {
    const rendered = renderGiftCardEmail({ locale, recipientName: 'Nour', buyerName: 'Maya', message: 'A little joy', amountMinor: 100000, code: 'ROSE-ABCD-2345-EFGH', expiresAt: '2027-08-20T00:00:00.000Z', recipientCopy: true });
    expect(rendered.subject).toContain(title);
    expect(rendered.text).toContain('ROSE-ABCD-2345-EFGH');
    expect(rendered.text).toMatch(locale === 'ar' ? /ج\.م/ : /EGP/);
    expect(rendered.text).toContain('Nour');
  });

  it('delivers once to each distinct buyer and recipient address', async () => {
    const recipients: string[] = [];
    const result = await deliverGiftCardPurchase({
      purchase: { recipientName: 'Nour', recipientEmail: 'nour@example.com', buyerEmail: 'maya@example.com', buyerName: 'Maya', message: '', amountMinor: 100000, code: 'ROSE-ABCD-2345-EFGH', expiresAt: '2027-08-20T00:00:00.000Z', locale: 'en' },
      send: async ({ recipient }) => { recipients.push(recipient); return true; },
    });
    expect(result).toEqual({ sent: 2, failed: 0 });
    expect(recipients).toEqual(['maya@example.com', 'nour@example.com']);
  });

  it('does not send a duplicate message when buyer and recipient are the same', async () => {
    let count = 0;
    const result = await deliverGiftCardPurchase({
      purchase: { recipientName: 'Nour', recipientEmail: 'same@example.com', buyerEmail: 'same@example.com', buyerName: 'Maya', message: '', amountMinor: 100000, code: 'ROSE-ABCD-2345-EFGH', expiresAt: '2027-08-20T00:00:00.000Z', locale: 'en' },
      send: async () => { count += 1; return true; },
    });
    expect(result).toEqual({ sent: 1, failed: 0 });
    expect(count).toBe(1);
  });
});
