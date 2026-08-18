import { describe, expect, it } from 'vitest';
import { deliveryBadgeVariant, deliveryLabel, deliveryStatusKeys, fulfillmentBadgeVariant, fulfillmentLabel, fulfillmentStatusKeys, paymentBadgeVariant, paymentLabel, paymentStatusKeys } from '@/features/admin/status-labels';

describe('status labels', () => {
  it('maps fulfillment statuses to i18n keys', () => {
    expect(fulfillmentStatusKeys).toEqual({
      confirmed: 'statusConfirmed', preparing: 'statusPreparing', ready_for_delivery: 'statusReadyForDelivery',
      out_for_delivery: 'statusOutForDelivery', delivered: 'statusDelivered', cancelled: 'statusCancelled',
    });
  });

  it('maps payment statuses to i18n keys', () => {
    expect(paymentStatusKeys).toEqual({
      pending: 'statusPending', payment_started: 'statusPaymentStarted', paid: 'statusPaid',
      payment_failed: 'statusPaymentFailed', cancelled: 'statusCancelled', refunded: 'statusRefunded',
    });
  });

  it('assigns fulfillment badge variants', () => {
    expect(fulfillmentBadgeVariant('delivered')).toBe('success');
    expect(fulfillmentBadgeVariant('cancelled')).toBe('destructive');
    expect(fulfillmentBadgeVariant('out_for_delivery')).toBe('default');
    expect(fulfillmentBadgeVariant('preparing')).toBe('secondary');
  });

  it('assigns payment badge variants', () => {
    expect(paymentBadgeVariant('paid')).toBe('success');
    expect(paymentBadgeVariant('refunded')).toBe('warning');
    expect(paymentBadgeVariant('payment_failed')).toBe('destructive');
    expect(paymentBadgeVariant('cancelled')).toBe('destructive');
    expect(paymentBadgeVariant('pending')).toBe('secondary');
  });

  it('maps delivery statuses to i18n keys', () => {
    expect(deliveryStatusKeys).toEqual({ pending: 'statusPending', sent: 'statusSent', failed: 'statusFailed' });
  });

  it('assigns delivery badge variants', () => {
    expect(deliveryBadgeVariant('sent')).toBe('success');
    expect(deliveryBadgeVariant('failed')).toBe('destructive');
    expect(deliveryBadgeVariant('pending')).toBe('secondary');
    expect(deliveryBadgeVariant('weird')).toBe('secondary');
  });

  it('resolves delivery labels through the t function', () => {
    const t = (key: string) => `[${key}]`;
    expect(deliveryLabel('sent', t)).toBe('[statusSent]');
    expect(deliveryLabel('weird', t)).toBe('[weird]');
  });

  it('falls back safely for unknown statuses', () => {
    const t = (key: string) => `[${key}]`;
    expect(fulfillmentLabel('weird', t)).toBe('[weird]');
    expect(fulfillmentBadgeVariant('weird')).toBe('secondary');
  });

  it('resolves labels through the t function', () => {
    const t = (key: string) => `[${key}]`;
    expect(paymentLabel('paid', t)).toBe('[statusPaid]');
    expect(fulfillmentLabel('delivered', t)).toBe('[statusDelivered]');
  });
});
