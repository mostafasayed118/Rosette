import { describe, expect, it } from 'vitest';
import { cancelRequestBadgeVariant, cancelRequestLabel, cancelRequestStatusKeys, changeRequestBadgeVariant, changeRequestLabel, changeRequestStatusKeys, deliveryBadgeVariant, deliveryLabel, deliveryStatusKeys, fulfillmentBadgeVariant, fulfillmentLabel, fulfillmentStatusKeys, giftCardBadgeVariant, giftCardLabel, giftCardStatusKeys, notificationBadgeVariant, notificationLabel, notificationStatusKeys, paymentBadgeVariant, paymentLabel, paymentStatusKeys, promoBadgeVariant, promoStatusKeys, reviewBadgeVariant, reviewLabel, reviewStatusKeys } from '@/features/admin/status-labels';

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
    expect(fulfillmentBadgeVariant('preparing')).toBe('default');
    expect(fulfillmentBadgeVariant('ready_for_delivery')).toBe('default');
    expect(fulfillmentBadgeVariant('confirmed')).toBe('default');
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
    expect(deliveryBadgeVariant('sent')).toBe('default');
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

describe('unified status labels', () => {
  it('maps review statuses', () => {
    expect(reviewStatusKeys).toEqual({ pending: 'statusPending', approved: 'statusApproved' });
    expect(reviewBadgeVariant('approved')).toBe('success');
    expect(reviewBadgeVariant('pending')).toBe('secondary');
  });

  it('maps cancel request statuses', () => {
    expect(cancelRequestStatusKeys).toEqual({ pending: 'statusPending', approved: 'cancelRequestApproved', rejected: 'cancelRequestRejected' });
    expect(cancelRequestBadgeVariant('approved')).toBe('success');
    expect(cancelRequestBadgeVariant('rejected')).toBe('destructive');
  });

  it('maps change request statuses', () => {
    expect(changeRequestStatusKeys).toEqual({ pending: 'statusPending', approved: 'changeApproved', applied: 'changeApplied', rejected: 'changeRejected' });
    expect(changeRequestBadgeVariant('applied')).toBe('success');
    expect(changeRequestBadgeVariant('rejected')).toBe('destructive');
  });

  it('maps promo active state', () => {
    expect(promoStatusKeys).toEqual({ active: 'active', inactive: 'inactive' });
    expect(promoBadgeVariant(true)).toBe('success');
    expect(promoBadgeVariant(false)).toBe('secondary');
  });

  it('maps gift card statuses', () => {
    expect(giftCardStatusKeys).toEqual({ active: 'giftCardStatus_active', depleted: 'giftCardStatus_depleted', expired: 'giftCardStatus_expired', void: 'giftCardStatus_void' });
    expect(giftCardBadgeVariant('depleted')).toBe('success');
    expect(giftCardBadgeVariant('expired')).toBe('destructive');
  });

  it('maps notification delivery statuses', () => {
    expect(notificationStatusKeys).toEqual({ pending: 'statusPending', sent: 'statusSent', failed: 'statusFailed' });
    expect(notificationBadgeVariant('sent')).toBe('default');
    expect(notificationBadgeVariant('failed')).toBe('destructive');
  });

  it('falls back to secondary for unknown statuses', () => {
    expect(reviewBadgeVariant('weird')).toBe('secondary');
  });

  it('resolves labels through the t function for new domains', () => {
    const t = (key: string) => `[${key}]`;
    expect(reviewLabel('approved', t)).toBe('[statusApproved]');
    expect(cancelRequestLabel('rejected', t)).toBe('[cancelRequestRejected]');
    expect(changeRequestLabel('applied', t)).toBe('[changeApplied]');
    expect(giftCardLabel('expired', t)).toBe('[giftCardStatus_expired]');
    expect(notificationLabel('failed', t)).toBe('[statusFailed]');
  });
});
