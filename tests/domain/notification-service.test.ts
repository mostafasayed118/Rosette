import { describe, expect, it, vi } from 'vitest';
import { sendOrderNotification } from '@/features/notifications/notification-service';

describe('notification service', () => {
  it('accepts a sent email through an injected transport', async () => {
    const transport = { sendMail: vi.fn().mockResolvedValue({ messageId: 'mail-1' }) };
    const result = await sendOrderNotification({ locale: 'en', type: 'payment_confirmed', orderNumber: 'RO-1', totalMinor: 12500, recipientEmail: 'buyer@example.com', orderUrl: 'https://example.com/orders/1' }, transport);
    expect(result).toEqual({ accepted: true });
    expect(transport.sendMail).toHaveBeenCalledOnce();
  });

  it('returns a retryable failure when Gmail rejects the send', async () => {
    const transport = { sendMail: vi.fn().mockRejectedValue(new Error('smtp unavailable')) };
    await expect(sendOrderNotification({ locale: 'en', type: 'payment_confirmed', orderNumber: 'RO-1', totalMinor: 12500, recipientEmail: 'buyer@example.com', orderUrl: 'https://example.com/orders/1' }, transport)).resolves.toEqual({ accepted: false, retryable: true });
  });
});
