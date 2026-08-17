import { describe, expect, it } from 'vitest';
import { validateCheckout } from '@/features/checkout/validation';
import type { CheckoutInput } from '@/features/checkout/types';

const valid: CheckoutInput = { recipientName: 'Maya Hassan', recipientPhone: '01000000000', address: '12 Garden Street', senderName: 'Nour', senderEmail: 'nour@example.com', deliveryDate: '2026-08-20', deliveryWindow: '12-3', paymentMethod: 'demo-card' };

describe('checkout validation', () => {
  it('returns named errors for missing required fields', () => {
    const errors = validateCheckout({ ...valid, recipientName: '', senderEmail: 'not-an-email', deliveryDate: '' });
    expect(errors.recipientName).toBe('Recipient name is required.');
    expect(errors.senderEmail).toBe('Enter a valid email address.');
    expect(errors.deliveryDate).toBe('Choose a delivery date.');
  });

  it('returns no errors for complete checkout input', () => {
    expect(validateCheckout(valid)).toEqual({});
  });
});
