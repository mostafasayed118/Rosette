import { describe, expect, it } from 'vitest';
import { calculatePaymobHmac, verifyPaymobCallback } from '@/features/payment/paymob-hmac';

const callback = {
  amount_cents: 12500,
  created_at: '2026-08-17T12:00:00Z',
  currency: 'EGP',
  error_occured: false,
  has_parent_transaction: false,
  id: 123,
  integration_id: 456,
  is_3d_secure: true,
  is_auth: true,
  is_capture: true,
  is_refunded: false,
  is_standalone_payment: true,
  is_voided: false,
  order: { id: 789 },
  owner: 321,
  pending: false,
  source_data: { pan: '1234', sub_type: 'VISA', type: 'card' },
  success: true,
};

describe('Paymob callback HMAC', () => {
  it('accepts a valid signature built from the documented field order', () => {
    const hmac = calculatePaymobHmac(callback, 'test-secret');
    expect(verifyPaymobCallback({ ...callback, hmac }, 'test-secret')).toBe(true);
  });

  it('rejects changed callback data', () => {
    const hmac = calculatePaymobHmac(callback, 'test-secret');
    expect(verifyPaymobCallback({ ...callback, amount_cents: 12501, hmac }, 'test-secret')).toBe(false);
  });

  it('rejects a missing signature', () => {
    expect(verifyPaymobCallback(callback, 'test-secret')).toBe(false);
  });
});
