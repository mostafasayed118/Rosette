import { describe, expect, it } from 'vitest';
import { renderOrderEmail } from '@/features/notifications/email-templates';
import { NOTIFICATION_TYPES } from '@/features/notifications/notification-retry';

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

  it('renders the ready_for_delivery subject in all three locales', () => {
    expect(renderOrderEmail({ locale: 'en', type: 'ready_for_delivery', orderNumber: 'RO-1', totalMinor: 10000, orderUrl: 'https://example.com/o/1' }).subject).toBe('Your order is ready for delivery');
    expect(renderOrderEmail({ locale: 'ar', type: 'ready_for_delivery', orderNumber: 'RO-1', totalMinor: 10000, orderUrl: 'https://example.com/o/1' }).subject).toBe('طلبك جاهز للتوصيل');
    expect(renderOrderEmail({ locale: 'fr', type: 'ready_for_delivery', orderNumber: 'RO-1', totalMinor: 10000, orderUrl: 'https://example.com/o/1' }).subject).toBe('Votre commande est prête pour la livraison');
  });

  it('includes the discount line when discountMinor is set', () => {
    const { text } = renderOrderEmail({ locale: 'en', type: 'order_received', orderNumber: 'RO-1', totalMinor: 9000, discountMinor: 1000, orderUrl: 'https://example.com/o/1' });
    expect(text).toMatch(/Discount −EGP\s*10/);
  });

  it('omits the discount line when absent', () => {
    const { text } = renderOrderEmail({ locale: 'en', type: 'order_received', orderNumber: 'RO-1', totalMinor: 10000, orderUrl: 'https://example.com/o/1' });
    expect(text).not.toContain('Discount');
  });

  it('renders a subtotal/delivery/discount/total breakdown when fields are present', () => {
    const { text, html } = renderOrderEmail({ locale: 'en', type: 'payment_confirmed', orderNumber: 'RO-1', totalMinor: 16500, subtotalMinor: 10000, deliveryFeeMinor: 7500, discountMinor: 1000, orderUrl: 'https://example.com/o/1' });
    expect(text).toMatch(/Subtotal:\s*EGP\s*100/);
    expect(text).toMatch(/Delivery:\s*EGP\s*75/);
    expect(text).toMatch(/Discount:\s*−?EGP\s*10/);
    expect(text).toMatch(/Total:\s*EGP\s*165/);
    expect(html).toContain('<li>Subtotal:');
    expect(html).toContain('<li>Delivery:');
    expect(html).toContain('<li>Discount:');
    expect(html).toContain('<li>Total:');
  });

  it('omits the discount line in the breakdown when there is no discount', () => {
    const { text } = renderOrderEmail({ locale: 'en', type: 'payment_confirmed', orderNumber: 'RO-1', totalMinor: 17500, subtotalMinor: 10000, deliveryFeeMinor: 7500, orderUrl: 'https://example.com/o/1' });
    expect(text).toMatch(/Subtotal:\s*EGP\s*100/);
    expect(text).toMatch(/Delivery:\s*EGP\s*75/);
    expect(text).not.toContain('Discount');
  });

  it('renders cancellation subjects in all three locales', () => {
    expect(renderOrderEmail({ locale: 'en', type: 'cancel_approved', orderNumber: 'RO-1', totalMinor: 10000, orderUrl: 'https://example.com/o/1' }).subject).toBe('Your cancellation was confirmed');
    expect(renderOrderEmail({ locale: 'ar', type: 'cancel_approved', orderNumber: 'RO-1', totalMinor: 10000, orderUrl: 'https://example.com/o/1' }).subject).toBe('تم تأكيد إلغاء طلبك');
    expect(renderOrderEmail({ locale: 'fr', type: 'cancel_rejected', orderNumber: 'RO-1', totalMinor: 10000, orderUrl: 'https://example.com/o/1' }).subject).toBe('Demande d’annulation refusée');
  });

  it('includes cancellation types in the retryable notification set', () => {
    expect(NOTIFICATION_TYPES.has('cancel_approved')).toBe(true);
    expect(NOTIFICATION_TYPES.has('cancel_rejected')).toBe(true);
  });
});
