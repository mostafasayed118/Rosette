import { describe, expect, it } from 'vitest';
import { createAdminWhatsAppHref } from '@/features/support/whatsapp';

describe('createAdminWhatsAppHref', () => {
  it('normalizes the number to digits and prefills the order text', () => {
    const href = createAdminWhatsAppHref({ number: '+20 100 000 0000', orderId: 'RO-ABC123' });
    expect(href).toBe(`https://wa.me/201000000000?text=${encodeURIComponent('Hello! This is Rosette regarding your order RO-ABC123.')}`);
  });

  it('returns null when the number has no digits', () => {
    expect(createAdminWhatsAppHref({ number: '+() -', orderId: 'RO-1' })).toBeNull();
    expect(createAdminWhatsAppHref({ number: '', orderId: 'RO-1' })).toBeNull();
  });
});
