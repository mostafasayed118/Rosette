import { describe, expect, it, vi } from 'vitest';
import { renderAbandonedCartEmail, sendAbandonedCartEmail } from '@/features/cart/abandoned-email';
import type { CartLine } from '@/features/cart/types';

const line: CartLine = { id: 'l1', productSlug: 'rose-hour', productName: 'Rose Hour', productNameAr: 'ساعة الورد', productNameFr: 'L’Heure des Roses', tone: '#bc6d63', unitPrice: 12000, quantity: 2, addOns: [], message: '', deliveryDate: '2026-08-20' };

describe('renderAbandonedCartEmail', () => {
  it('renders an English email with item, subtotal, and restore link', () => {
    const email = renderAbandonedCartEmail({ locale: 'en', items: [line], restoreUrl: 'https://x/en/cairo/cart?restore=t1' });
    expect(email.subject).toBe('Your Rosette bag is waiting');
    expect(email.text).toContain('Rose Hour × 2');
    expect(email.text).toContain('https://x/en/cairo/cart?restore=t1');
    expect(email.html).toContain('https://x/en/cairo/cart?restore=t1');
  });

  it('renders Arabic right-to-left', () => {
    const email = renderAbandonedCartEmail({ locale: 'ar', items: [line], restoreUrl: 'https://x/ar/cairo/cart?restore=t1' });
    expect(email.subject).toContain('حقيبتك');
    expect(email.html).toContain('dir="rtl"');
    expect(email.text).toContain('ساعة الورد');
  });

  it('renders French', () => {
    const email = renderAbandonedCartEmail({ locale: 'fr', items: [line], restoreUrl: 'https://x/fr/cairo/cart?restore=t1' });
    expect(email.subject).toBe('Votre panier Rosette vous attend');
    expect(email.text).toContain('L’Heure des Roses');
  });

  it('escapes HTML in item names', () => {
    const evil: CartLine = { ...line, productName: '<script>alert(1)</script>' };
    const email = renderAbandonedCartEmail({ locale: 'en', items: [evil], restoreUrl: 'https://x' });
    expect(email.html).not.toContain('<script>alert');
    expect(email.html).toContain('&lt;script&gt;');
  });

  it('renders a signed engagement unsubscribe link when provided', () => {
    const email = renderAbandonedCartEmail({ locale: 'en', items: [line], restoreUrl: 'https://x/cart', unsubscribeUrl: 'https://x/unsubscribe?email=a%40b.com&token=abc' });
    expect(email.text).toContain('https://x/unsubscribe?email=a%40b.com&token=abc');
    expect(email.html).toContain('https://x/unsubscribe?email=a%40b.com&amp;token=abc');
  });

  it('adds RFC unsubscribe headers when sending engagement mail', async () => {
    const transport = { sendMail: vi.fn().mockResolvedValue(undefined) };
    await sendAbandonedCartEmail({ to: 'buyer@example.com', locale: 'en', items: [line], restoreUrl: 'https://x/cart', unsubscribeUrl: 'https://x/unsubscribe' }, transport);
    expect(transport.sendMail).toHaveBeenCalledWith(expect.objectContaining({ headers: { 'List-Unsubscribe': '<https://x/unsubscribe>', 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } }));
  });
});
