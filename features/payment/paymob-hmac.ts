import { createHmac, timingSafeEqual } from 'node:crypto';

type Callback = {
  hmac?: string;
  amount_cents?: number;
  created_at?: string;
  currency?: string;
  error_occured?: boolean;
  has_parent_transaction?: boolean;
  id?: number;
  integration_id?: number;
  is_3d_secure?: boolean;
  is_auth?: boolean;
  is_capture?: boolean;
  is_refunded?: boolean;
  is_standalone_payment?: boolean;
  is_voided?: boolean;
  order?: { id?: number };
  owner?: number;
  pending?: boolean;
  source_data?: { pan?: string; sub_type?: string; type?: string };
  success?: boolean;
};

function value(value: unknown) {
  return String(value ?? '');
}

export function paymobHmacMessage(payload: Callback) {
  return [
    value(payload.amount_cents),
    value(payload.created_at),
    value(payload.currency),
    value(payload.error_occured),
    value(payload.has_parent_transaction),
    value(payload.id),
    value(payload.integration_id),
    value(payload.is_3d_secure),
    value(payload.is_auth),
    value(payload.is_capture),
    value(payload.is_refunded),
    value(payload.is_standalone_payment),
    value(payload.is_voided),
    value(payload.order?.id),
    value(payload.owner),
    value(payload.pending),
    value(payload.source_data?.pan),
    value(payload.source_data?.sub_type),
    value(payload.source_data?.type),
    value(payload.success),
  ].join('');
}

export function calculatePaymobHmac(payload: Callback, secret: string) {
  return createHmac('sha512', secret).update(paymobHmacMessage(payload)).digest('hex');
}

export function verifyPaymobCallback(payload: Callback, secret: string) {
  if (!payload.hmac) return false;
  const expected = Buffer.from(calculatePaymobHmac(payload, secret), 'utf8');
  const actual = Buffer.from(payload.hmac, 'utf8');
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
