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
});
