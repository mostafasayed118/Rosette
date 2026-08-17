import { describe, expect, it } from 'vitest';
import { createWhatsAppHref } from '@/features/support/whatsapp';

describe('WhatsApp support links', () => {
  it('normalizes the phone and encodes the order message', () => {
    const href = createWhatsAppHref({ number: '+20 100 000 0000', locale: 'en', orderId: 'RO-123' });
    expect(href).toBe('https://wa.me/201000000000?text=Hello%20Rosette%2C%20I%20need%20help%20with%20order%20RO-123.');
  });

  it('uses Arabic copy without exposing address or payment details', () => {
    expect(createWhatsAppHref({ number: '201000000000', locale: 'ar' })).toContain('%D9%85%D8%B1%D8%AD%D8%A8%D8%A7');
  });
});
