export type BadgeTone = 'success' | 'warning' | 'destructive' | 'default' | 'secondary';

export const fulfillmentStatusKeys: Record<string, string> = {
  confirmed: 'statusConfirmed',
  preparing: 'statusPreparing',
  ready_for_delivery: 'statusReadyForDelivery',
  out_for_delivery: 'statusOutForDelivery',
  delivered: 'statusDelivered',
  cancelled: 'statusCancelled',
};

export const paymentStatusKeys: Record<string, string> = {
  pending: 'statusPending',
  payment_started: 'statusPaymentStarted',
  paid: 'statusPaid',
  payment_failed: 'statusPaymentFailed',
  cancelled: 'statusCancelled',
  refunded: 'statusRefunded',
};

export const deliveryStatusKeys: Record<string, string> = {
  pending: 'statusPending',
  sent: 'statusSent',
  failed: 'statusFailed',
};

export const reviewStatusKeys: Record<string, string> = {
  pending: 'statusPending',
  approved: 'statusApproved',
};

export const cancelRequestStatusKeys: Record<string, string> = {
  pending: 'statusPending',
  approved: 'cancelRequestApproved',
  rejected: 'cancelRequestRejected',
};

export const changeRequestStatusKeys: Record<string, string> = {
  pending: 'statusPending',
  approved: 'changeApproved',
  applied: 'changeApplied',
  rejected: 'changeRejected',
};

export const promoStatusKeys: Record<string, string> = {
  active: 'active',
  inactive: 'inactive',
};

export const giftCardStatusKeys: Record<string, string> = {
  active: 'giftCardStatus_active',
  depleted: 'giftCardStatus_depleted',
  expired: 'giftCardStatus_expired',
  void: 'giftCardStatus_void',
};

export const notificationStatusKeys: Record<string, string> = {
  pending: 'statusPending',
  sent: 'statusSent',
  failed: 'statusFailed',
};

function unifiedBadgeVariant(status: string): BadgeTone {
  if (['paid', 'delivered', 'active', 'completed', 'approved', 'redeemed', 'applied', 'depleted'].includes(status)) return 'success';
  if (['preparing', 'ready_for_delivery', 'payment_started', 'confirmed', 'out_for_delivery', 'sent', 'in_progress'].includes(status)) return 'default';
  if (['pending', 'scheduled', 'draft'].includes(status)) return 'secondary';
  if (['refunded', 'partially_refunded'].includes(status)) return 'warning';
  if (['payment_failed', 'cancelled', 'expired', 'rejected', 'failed'].includes(status)) return 'destructive';
  return 'secondary';
}

export function fulfillmentBadgeVariant(status: string): BadgeTone {
  return unifiedBadgeVariant(status);
}

export function paymentBadgeVariant(status: string): BadgeTone {
  return unifiedBadgeVariant(status);
}

export function deliveryBadgeVariant(status: string): BadgeTone {
  return unifiedBadgeVariant(status);
}

export function reviewBadgeVariant(status: string): BadgeTone {
  return unifiedBadgeVariant(status);
}

export function cancelRequestBadgeVariant(status: string): BadgeTone {
  return unifiedBadgeVariant(status);
}

export function changeRequestBadgeVariant(status: string): BadgeTone {
  return unifiedBadgeVariant(status);
}

export function promoBadgeVariant(active: boolean): BadgeTone {
  return unifiedBadgeVariant(active ? 'active' : 'inactive');
}

export function giftCardBadgeVariant(status: string): BadgeTone {
  return unifiedBadgeVariant(status);
}

export function notificationBadgeVariant(status: string): BadgeTone {
  return unifiedBadgeVariant(status);
}

export function fulfillmentLabel(status: string, t: (key: string) => string): string {
  return t(fulfillmentStatusKeys[status] ?? status);
}

export function paymentLabel(status: string, t: (key: string) => string): string {
  return t(paymentStatusKeys[status] ?? status);
}

export function deliveryLabel(status: string, t: (key: string) => string): string {
  return t(deliveryStatusKeys[status] ?? status);
}

export function reviewLabel(status: string, t: (key: string) => string): string {
  return t(reviewStatusKeys[status] ?? status);
}

export function cancelRequestLabel(status: string, t: (key: string) => string): string {
  return t(cancelRequestStatusKeys[status] ?? status);
}

export function changeRequestLabel(status: string, t: (key: string) => string): string {
  return t(changeRequestStatusKeys[status] ?? status);
}

export function promoSuffixLabel(active: boolean, t: (key: string) => string): string {
  return t(active ? 'active' : 'inactive');
}

export function giftCardLabel(status: string, t: (key: string) => string): string {
  return t(giftCardStatusKeys[status] ?? status);
}

export function notificationLabel(status: string, t: (key: string) => string): string {
  return t(notificationStatusKeys[status] ?? status);
}
