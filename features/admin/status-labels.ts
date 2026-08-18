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

export function fulfillmentBadgeVariant(status: string): BadgeTone {
  if (status === 'delivered') return 'success';
  if (status === 'cancelled') return 'destructive';
  if (status === 'out_for_delivery') return 'default';
  return 'secondary';
}

export function paymentBadgeVariant(status: string): BadgeTone {
  if (status === 'paid') return 'success';
  if (status === 'refunded') return 'warning';
  if (status === 'payment_failed' || status === 'cancelled') return 'destructive';
  return 'secondary';
}

export function fulfillmentLabel(status: string, t: (key: string) => string): string {
  return t(fulfillmentStatusKeys[status] ?? status);
}

export function paymentLabel(status: string, t: (key: string) => string): string {
  return t(paymentStatusKeys[status] ?? status);
}
