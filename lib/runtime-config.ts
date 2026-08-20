import { getOptionalServerEnv } from '@/lib/server-env';

export type DeploymentRuntime = 'cloudflare' | 'node';
export type PaymentMode = 'cod' | 'paymob_test' | 'paymob_live';
export type EmailDeliveryMode = 'disabled' | 'smtp';

const RUNTIMES: DeploymentRuntime[] = ['cloudflare', 'node'];
const PAYMENT_MODES: PaymentMode[] = ['cod', 'paymob_test', 'paymob_live'];
const EMAIL_MODES: EmailDeliveryMode[] = ['disabled', 'smtp'];

function allowed<T extends string>(value: string | undefined, values: readonly T[], fallback: T): T {
  return values.includes(value as T) ? (value as T) : fallback;
}

export function getDeploymentRuntime(): DeploymentRuntime {
  return allowed(getOptionalServerEnv('DEPLOYMENT_RUNTIME'), RUNTIMES, 'node');
}

export function getPaymentMode(): PaymentMode {
  return allowed(getOptionalServerEnv('PAYMENT_MODE'), PAYMENT_MODES, 'cod');
}

export function getEmailDeliveryMode(): EmailDeliveryMode {
  const fallback: EmailDeliveryMode = getDeploymentRuntime() === 'cloudflare' ? 'disabled' : 'smtp';
  return allowed(getOptionalServerEnv('EMAIL_DELIVERY_MODE'), EMAIL_MODES, fallback);
}

export function isEmailDeliveryDisabled(): boolean {
  return getEmailDeliveryMode() === 'disabled';
}

export function isPaymobEnabled(): boolean {
  const mode = getPaymentMode();
  if (mode !== 'paymob_test' && mode !== 'paymob_live') return false;
  return Boolean(
    getOptionalServerEnv('PAYMOB_API_KEY') &&
    getOptionalServerEnv('PAYMOB_PUBLIC_KEY') &&
    getOptionalServerEnv('PAYMOB_INTEGRATION_ID') &&
    getOptionalServerEnv('PAYMOB_HMAC_SECRET'),
  );
}
