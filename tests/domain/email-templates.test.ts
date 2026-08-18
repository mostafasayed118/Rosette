import { describe, expect, it } from 'vitest';
import { renderOrderEmail } from '@/features/notifications/email-templates';

describe('order email templates', () => {
  it('renders Arabic as RTL and escapes order values', () => {
    const email = renderOrderEmail({ locale: 'ar', type: 'payment_confirmed', orderNumber: '<RO-1>', totalMinor: 12500, orderUrl: 'https://example.com/orders/1' });
    expect(email.html).toContain('dir="rtl"');
    expect(email.html).toContain('&lt;RO-1&gt;');
    expect(email.subject).toContain('تأكيد');
  });

  it('renders English as LTR', () => {
    const email = renderOrderEmail({ locale: 'en', type: 'payment_confirmed', orderNumber: 'RO-1', totalMinor: 12500, orderUrl: 'https://example.com/orders/1' });
    expect(email.html).toContain('dir="ltr"');
    expect(email.subject).toContain('Payment');
  });

  it('renders French as LTR with a French subject and body', () => {
    const email = renderOrderEmail({ locale: 'fr', type: 'payment_confirmed', orderNumber: 'RO-1', totalMinor: 12500, orderUrl: 'https://example.com/orders/1' });
    expect(email.html).toContain('dir="ltr"');
    expect(email.html).toContain('lang="fr"');
    expect(email.subject).toBe('Paiement confirmé');
    expect(email.html).toContain('Mise à jour de votre commande');
    expect(email.html).toContain('Votre numéro de commande est RO-1.');
  });
});
